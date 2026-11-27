import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import * as z from "zod/v4";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { articleSlugTaken } from "@/lib/beehiiv/sync";
import { uniqueSlug } from "@/lib/gives/queries";
import { sanitizeRichText } from "@/lib/sanitize";
import { absoluteUrl, TUSCARAWAS_CITIES } from "@/lib/utils";
import { aiConfigured, analysisModel } from "./analyze";
import { ACTION_STATUS_LABEL, DOC_TYPE_LABEL, isOneOf, ACTION_STATUSES, DOC_TYPES } from "./shared";

/**
 * Draft news articles from Government Watch documents and findings. The draft goes into the normal article
 * system as a DRAFT (never published automatically) with a "Sources" list linking every original document.
 */
const Draft = z.object({
  title: z.string().describe("Accurate news headline. Use 'considers/discusses' for proposed or discussed items, 'approves' only for approved ones."),
  excerpt: z.string().describe("One or two sentence summary for listings."),
  bodyHtml: z.string().describe("Article body in simple HTML: <p>, <h2>, <ul>, <li>, <strong>, <em> only. No links (sources are added separately)."),
});

export const ARTICLE_PROMPT = `You write local news for T County Connect (Tuscarawas County, Ohio) from public government records. Write a clear, neutral news article for residents using ONLY the facts provided: the documents' text and the extracted findings. Never add outside facts, quotes, names or context you weren't given.

- State plainly whether each action was officially approved, voted down, only proposed, only discussed, tabled or scheduled. Never describe a proposal or discussion as a decision.
- Attribute facts to the record: "according to the meeting minutes", "the agenda lists".
- Copy amounts, names, vote counts and dates exactly.
- If something is unclear in the record, say it isn't clear rather than guessing.
- Lead with what matters most to residents; keep paragraphs short. 250–600 words unless the material is very small.
- An editor will review, fact-check and approve this draft before anything is published.`;

const docLabel = (d: { title: string; docType: string; meetingDate: Date | null; source: { name: string } | null }) =>
  `${d.source?.name ? `${d.source.name} — ` : ""}${isOneOf(DOC_TYPES, d.docType) ? DOC_TYPE_LABEL[d.docType] : "Document"}${d.meetingDate ? `, ${d.meetingDate.toISOString().slice(0, 10)}` : ""}: ${d.title}`;

/** Draft one article from documents and/or findings. Returns the new article's id. */
export async function draftArticle(opts: { documentIds?: string[]; findingIds?: string[]; userId: string | null }): Promise<{ ok: true; articleId: string } | { ok: false; message: string }> {
  if (!aiConfigured()) return { ok: false, message: "AI drafting isn't set up: add ANTHROPIC_API_KEY to the server's environment." };
  const findings = opts.findingIds?.length
    ? await db.govFinding.findMany({ where: { id: { in: opts.findingIds.slice(0, 50) } }, orderBy: [{ priority: "asc" }, { createdAt: "asc" }] })
    : [];
  const docIds = [...new Set([...(opts.documentIds ?? []), ...findings.map((f) => f.documentId)])].slice(0, 12);
  if (!docIds.length) return { ok: false, message: "Choose at least one document or story." };
  const docs = await db.govDocument.findMany({
    where: { id: { in: docIds } },
    select: { id: true, title: true, docType: true, meetingDate: true, sourceUrl: true, storageUrl: true, summary: true, textContent: true, source: { select: { name: true, community: true } }, findings: !opts.findingIds?.length },
  });
  const useFindings = findings.length ? findings : docs.flatMap((d) => (d as unknown as { findings: typeof findings }).findings ?? []);

  // Keep the request to a sensible size: documents' text, shortest first, up to ~300k characters in total.
  let budget = 300_000;
  const docBlocks = [...docs].sort((a, b) => (a.textContent?.length ?? 0) - (b.textContent?.length ?? 0)).map((d) => {
    const text = d.textContent ?? "";
    const part = text.length <= budget ? text : "";
    budget -= part.length;
    return `<document title="${docLabel(d).replace(/"/g, "'")}">\n${d.summary ? `Summary: ${d.summary}\n\n` : ""}${part || "(Full text not included; use the summary and findings.)"}\n</document>`;
  });
  const findingLines = useFindings.map((f) => `- [${isOneOf(ACTION_STATUSES, f.actionStatus) ? ACTION_STATUS_LABEL[f.actionStatus] : f.actionStatus}] ${f.headline}: ${f.detail}${f.amount ? ` Amount: ${f.amount}.` : ""}${f.voteResult ? ` Vote: ${f.voteResult}.` : ""}${f.pageNumber ? ` (page ${f.pageNumber})` : ""}`);

  let draft: z.infer<typeof Draft>;
  try {
    const res = await new Anthropic({ maxRetries: 2, timeout: 10 * 60 * 1000 }).beta.messages.parse({
      model: analysisModel(), max_tokens: 16000, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(Draft) },
      system: [{ type: "text", text: ARTICLE_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: `${docBlocks.join("\n\n")}\n\n${findingLines.length ? `Findings to cover:\n${findingLines.join("\n")}\n\n` : ""}Write the draft article.` }],
    });
    if (res.stop_reason === "refusal") return { ok: false, message: "The AI declined to draft this article." };
    if (!res.parsed_output) return { ok: false, message: "The AI response couldn't be read. Try again." };
    draft = res.parsed_output;
  } catch (e) {
    return { ok: false, message: e instanceof Anthropic.APIError ? `The AI service returned an error (${e.status ?? "network"}). Try again.` : (e as Error).message.slice(0, 300) };
  }

  const sources = docs.map((d) => {
    const links = [d.sourceUrl ? `<a href="${d.sourceUrl}">original on the government website</a>` : null, `<a href="${/^https?:/.test(d.storageUrl) ? d.storageUrl : absoluteUrl(d.storageUrl)}">saved copy</a>`].filter(Boolean).join(" · ");
    return `<li>${docLabel(d).replace(/</g, "&lt;")} (${links})</li>`;
  });
  const content = sanitizeRichText(`${draft.bodyHtml}<h2>Sources</h2><p>This article is based on public records:</p><ul>${sources.join("")}</ul>`);
  const community = docs.map((d) => d.source?.community).find((c) => c && (TUSCARAWAS_CITIES as readonly string[]).includes(c)) ?? null;
  const slug = await uniqueSlug(draft.title, articleSlugTaken);
  const category = await db.category.findFirst({ where: { OR: [{ slug: "government" }, { slug: "local-government" }, { name: { equals: "Government", mode: "insensitive" } }] }, select: { id: true } });
  const article = await db.article.create({
    data: {
      slug, title: draft.title.slice(0, 300), excerpt: draft.excerpt.slice(0, 500), content, status: "DRAFT", kind: "GENERAL", city: community,
      authorId: opts.userId ?? undefined, ...(category ? { categories: { connect: { id: category.id } } } : {}),
    },
    select: { id: true },
  });
  if (useFindings.length) await db.govFinding.updateMany({ where: { id: { in: useFindings.map((f) => f.id) }, articleId: null }, data: { articleId: article.id } });
  await audit(opts.userId, "govwatch.article_drafted", "Article", article.id, { documents: docs.length, findings: useFindings.length });
  return { ok: true, articleId: article.id };
}

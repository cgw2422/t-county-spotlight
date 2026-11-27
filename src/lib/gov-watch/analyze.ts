import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import * as z from "zod/v4";
import { db } from "@/lib/db";
import { ACTION_STATUSES, CATEGORIES, DOC_TYPES, PRIORITIES } from "./shared";
import { linkRevisionByMeeting } from "./store";

/**
 * AI analysis of one collected document: meeting date, a short summary and potential news stories ("findings"),
 * each with what kind of action it is (proposed / discussed / officially approved …), a newsworthiness priority and
 * the page it came from. Runs once per new or changed document — never re-run automatically on an analyzed one.
 *
 * Model: GOVWATCH_MODEL (default Claude Opus 5.5). Cost: only the extracted text is sent; scanned PDFs and images
 * are sent as the original file (Claude reads the pages). The instructions are cached between documents.
 */
export const DEFAULT_MODEL = "claude-opus-5-5";
export const analysisModel = () => process.env.GOVWATCH_MODEL?.trim() || DEFAULT_MODEL;
export const aiConfigured = () => !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

/** Longest text sent in one request (~120k tokens). Longer documents are flagged, never silently cut. */
export const MAX_TEXT_CHARS = 480_000;
/** Claude reads PDFs of up to 100 pages / 32 MB per request. */
const MAX_SCAN_BYTES = 30 * 1024 * 1024;

const Finding = z.object({
  category: z.enum(CATEGORIES),
  headline: z.string().describe("Short, factual, news-style headline (max ~15 words)."),
  detail: z.string().describe("2–4 plain sentences: what happened, who, how much, what happens next. Only facts in the document."),
  actionStatus: z.enum(ACTION_STATUSES),
  priority: z.enum(PRIORITIES),
  amount: z.string().nullable().describe("Dollar amount(s) exactly as written, or null."),
  voteResult: z.string().nullable().describe("Vote tally / who voted how, as recorded (e.g. '3-0', 'Smith yes, Jones no'), or null."),
  pageNumber: z.number().int().nullable().describe("Page from the [Page N] markers (or the PDF page), or null if unknown."),
  quote: z.string().nullable().describe("A short exact excerpt (under 300 characters) that supports this finding."),
  eventDate: z.string().nullable().describe("YYYY-MM-DD for upcoming meetings, hearings, closures or deadlines; else null."),
});
const Analysis = z.object({
  meetingDate: z.string().nullable().describe("YYYY-MM-DD of the meeting this document is about, or null."),
  meetingBody: z.string().nullable().describe("The body that met, e.g. 'Dover City Council', or null."),
  documentType: z.enum(DOC_TYPES),
  summary: z.string().describe("3–5 sentence plain-language summary of the document."),
  findings: z.array(Finding),
});
export type AnalysisResult = z.infer<typeof Analysis>;

export const SYSTEM_PROMPT = `You review local government documents (meeting minutes, agendas, packets, ordinances, notices) from Tuscarawas County, Ohio, for T County Connect, a local news site. Your job is to find what residents would want to know and to report it accurately.

Extract potential news stories ("findings") about: important decisions, voting results, government spending, road construction and closures, tax and utility rate changes, zoning and development, new businesses, grants and funding, community improvements, new ordinances and resolutions, and upcoming public meetings or hearings. Skip routine items (approving previous minutes, paying routine bills without a notable amount, adjournment) unless something notable happened.

Accuracy rules — these matter more than anything else:
- Use only what the document says. Never add outside facts, guesses or assumptions. If something is unclear, say so in the detail or leave the field null.
- actionStatus must reflect the document exactly:
  - "approved": the body formally voted to pass/approve/adopt it (a motion carried).
  - "rejected": a vote was taken and failed.
  - "proposed": introduced, a first or second reading, recommended, or requested, but not yet adopted.
  - "discussed": talked about with no formal action.
  - "tabled": postponed or tabled.
  - "scheduled": a future meeting, hearing, closure or deadline is announced.
  - "informational": a report or update with no action.
  An agenda lists items to be considered: agenda items are "proposed" or "scheduled", never "approved".
- Headlines and details must not overstate: write "Council considers…" for proposed items, "Council approves…" only for approved ones.
- Amounts, names, vote counts and dates must be copied exactly as written.
- pageNumber: use the "[Page N]" marker that precedes the text (or the PDF page you read it on). null if unknown.
- priority: "high" = directly affects many residents' money, safety, roads, schools or services, or a major development/controversy; "medium" = notable local decision or spending; "low" = minor but still worth a brief mention.
- Return an empty findings list if nothing is newsworthy. Never invent findings to fill the list.`;

type DocForAnalysis = {
  id: string; title: string; docType: string; fileType: string; mimeType: string; sourceUrl: string | null; storageKey: string;
  textContent: string | null; sizeBytes: number; source: { name: string; community: string; govType: string } | null;
  emailSubject: string | null; storageUrl: string;
};

async function originalBytes(d: DocForAnalysis): Promise<Buffer> {
  const { readStoredObject } = await import("./read-object");
  return readStoredObject(d.storageKey, d.storageUrl);
}

function client() {
  return new Anthropic({ maxRetries: 2, timeout: 10 * 60 * 1000 });
}

const isoDate = (s: string | null | undefined) => {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Analyzes one document and stores the summary and findings. Throws nothing; failures are recorded on the document. */
export async function analyzeDocument(id: string): Promise<{ ok: boolean; message: string; findings?: number }> {
  if (!aiConfigured()) return { ok: false, message: "AI analysis isn't set up: add ANTHROPIC_API_KEY to the server's environment." };
  // Claim it (one analysis at a time per document).
  const claimed = await db.govDocument.updateMany({ where: { id, status: { in: ["new", "failed", "skipped"] } }, data: { status: "analyzing", analysisError: null } });
  if (!claimed.count) return { ok: false, message: "This document is already analyzed or being analyzed." };
  const d = await db.govDocument.findUniqueOrThrow({
    where: { id },
    select: { id: true, title: true, docType: true, fileType: true, mimeType: true, sourceUrl: true, storageKey: true, storageUrl: true, textContent: true, sizeBytes: true, emailSubject: true, source: { select: { name: true, community: true, govType: true } } },
  });
  const model = analysisModel();
  try {
    const header = [
      `Government body: ${d.source ? `${d.source.name} (${d.source.community}; ${d.source.govType.replace("_", " ")})` : "not assigned yet"}`,
      `Document title: ${d.title}`,
      `Collected as: ${d.docType}`,
      d.sourceUrl ? `Original address: ${d.sourceUrl}` : null,
      d.emailSubject ? `Emailed with subject: ${d.emailSubject}` : null,
    ].filter(Boolean).join("\n");

    let content: Anthropic.Beta.BetaContentBlockParam[];
    if (d.textContent) {
      if (d.textContent.length > MAX_TEXT_CHARS) {
        await db.govDocument.update({ where: { id }, data: { status: "skipped", analysisError: `This document's text is very long (${Math.round(d.textContent.length / 1000)}k characters), so it wasn't sent for analysis automatically. Review it manually or upload the relevant pages.` } });
        return { ok: false, message: "Document too long for automatic analysis." };
      }
      content = [{ type: "text", text: `${header}\n\n<document>\n${d.textContent}\n</document>\n\nAnalyze this document.` }];
    } else if (d.fileType === "pdf" || d.fileType === "image") {
      if (d.sizeBytes > MAX_SCAN_BYTES) throw new Error("The scanned file is too large to analyze (30 MB max).");
      const data = (await originalBytes(d)).toString("base64");
      const file: Anthropic.Beta.BetaContentBlockParam = d.fileType === "pdf"
        ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
        : { type: "image", source: { type: "base64", media_type: (["image/png", "image/jpeg", "image/gif", "image/webp"].includes(d.mimeType) ? d.mimeType : "image/jpeg") as "image/png" | "image/jpeg" | "image/gif" | "image/webp", data } };
      content = [file, { type: "text", text: `${header}\n\nThis is a scanned document: read the pages and analyze it.` }];
    } else {
      await db.govDocument.update({ where: { id }, data: { status: "skipped", analysisError: "No readable text was found in this document." } });
      return { ok: false, message: "No readable text." };
    }

    const res = await client().beta.messages.parse({
      model,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(Analysis) },
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content }],
    });
    if (res.stop_reason === "refusal") throw new Error("The AI declined to analyze this document.");
    if (res.stop_reason === "max_tokens") throw new Error("The analysis was cut off (too many findings). Try again or review manually.");
    const out = res.parsed_output;
    if (!out) throw new Error("The AI response couldn't be read.");
    await saveAnalysis(id, out, { model: res.model, inputTokens: res.usage.input_tokens + (res.usage.cache_read_input_tokens ?? 0) + (res.usage.cache_creation_input_tokens ?? 0), outputTokens: res.usage.output_tokens });
    return { ok: true, message: `Analyzed: ${out.findings.length} potential stor${out.findings.length === 1 ? "y" : "ies"}.`, findings: out.findings.length };
  } catch (e) {
    const message = e instanceof Anthropic.AuthenticationError ? "The Anthropic API key was rejected."
      : e instanceof Anthropic.RateLimitError ? "The AI service is busy (rate limited). It will be retried on the next run."
      : (e as Error).message.slice(0, 500);
    await db.govDocument.update({ where: { id }, data: { status: "failed", analysisError: message } });
    return { ok: false, message };
  }
}

/** Stores an analysis (replacing earlier findings of this document that were never reviewed). */
export async function saveAnalysis(id: string, out: AnalysisResult, meta: { model: string; inputTokens?: number; outputTokens?: number }) {
  const meetingDate = isoDate(out.meetingDate);
  await db.$transaction([
    db.govFinding.deleteMany({ where: { documentId: id, reviewStatus: "new", articleId: null } }),
    db.govFinding.createMany({
      data: out.findings.map((f) => ({
        documentId: id, category: f.category, headline: f.headline.slice(0, 300), detail: f.detail.slice(0, 4000), actionStatus: f.actionStatus,
        priority: f.priority, amount: f.amount?.slice(0, 300) || null, voteResult: f.voteResult?.slice(0, 500) || null,
        pageNumber: f.pageNumber && f.pageNumber > 0 && f.pageNumber < 10000 ? f.pageNumber : null, quote: f.quote?.slice(0, 600) || null,
        eventDate: isoDate(f.eventDate),
      })),
    }),
    db.govDocument.update({
      where: { id },
      data: {
        status: "analyzed", analyzedAt: new Date(), analysisModel: meta.model, inputTokens: meta.inputTokens ?? null, outputTokens: meta.outputTokens ?? null,
        summary: out.summary.slice(0, 4000), meetingBody: out.meetingBody?.slice(0, 300) || undefined, analysisError: null,
        ...(meetingDate ? { meetingDate } : {}),
        ...(out.documentType !== "other" ? { docType: out.documentType } : {}),
      },
    }),
  ]);
  await linkRevisionByMeeting(id);
}

/** Cron step: analyze a few waiting documents (oldest first). Failed ones are retried once a day at most. */
export async function analyzePending(limit = 3) {
  if (!aiConfigured()) return { skipped: "no ANTHROPIC_API_KEY" };
  const retryBefore = new Date(Date.now() - 24 * 3600_000);
  const docs = await db.govDocument.findMany({
    where: { OR: [{ status: "new" }, { status: "failed", updatedAt: { lt: retryBefore }, analysisError: { not: { contains: "declined" } } }], supersededAt: null },
    orderBy: { discoveredAt: "asc" }, take: limit, select: { id: true },
  });
  let ok = 0, failed = 0;
  for (const d of docs) {
    if ((await analyzeDocument(d.id)).ok) ok++;
    else failed++;
  }
  return { analyzed: ok, failed };
}

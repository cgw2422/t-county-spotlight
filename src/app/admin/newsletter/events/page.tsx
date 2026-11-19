import { requireAdmin } from "@/lib/auth";
import { PageHeader, Card, Notice } from "@/components/admin/page-header";
import { ARCHIVE_TAG } from "@/lib/beehiiv/sync";
import { BEEHIIV_APP_POSTS_URL, beehiivEditUrl } from "@/lib/beehiiv/posts-api";
import {
  FALLBACK_BASE_URL, getTemplateId, listToolDrafts, loadRangeOccurrences, missingBeehiivVars, newRequestToken, newsletterBaseUrl, parseRange, applySelection,
} from "@/lib/newsletter-events";
import { DEFAULT_INTRO, buildSectionBlocks, placeLabel, renderPreviewDocument, whenLabel } from "@/lib/newsletter-events-html";
import { admissionLabel } from "@/lib/events";
import { previewSignature, type ToolState } from "@/lib/newsletter-events-shared";
import { formatDateTime } from "@/lib/utils";
import { EventsTool, type ToolOccurrence } from "./events-tool";
import { TemplateSettingsForm } from "./settings-form";
import { CheckBeehiivButton } from "./check-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Newsletter Events" };

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? undefined;
const code = "rounded bg-slate-100 px-1 text-xs break-all";

export default async function NewsletterEventsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin();
  const sp = await searchParams;
  const now = new Date();
  const range = parseRange(one(sp.from), one(sp.to), now);
  const state: ToolState = {
    from: range.fromKey,
    to: range.toKey,
    excluded: (one(sp.ex) ?? "").split(",").filter(Boolean),
    featured: one(sp.feat) || null,
    title: one(sp.title) ?? "",
    subtitle: one(sp.subtitle) ?? "",
    intro: one(sp.intro) ?? DEFAULT_INTRO,
    archiveTag: one(sp.tag) !== "0",
  };
  const [all, templateId, drafts] = await Promise.all([loadRangeOccurrences(range, now), getTemplateId(), listToolDrafts(10)]);
  const missing = missingBeehiivVars();
  const { base, fromEnv } = newsletterBaseUrl();

  const occurrences: ToolOccurrence[] = all.map((o) => ({
    key: o.key, title: o.title, when: whenLabel(o), place: placeLabel(o), price: admissionLabel(o), recurring: o.recurring, startIso: o.occurrenceStart.toISOString(),
  }));

  let preview: { html: string; cardsHtml: string; count: number } | null = null;
  if (one(sp.preview) === "1") {
    const { featured, items } = applySelection(all, { excluded: state.excluded, featured: state.featured });
    const blocks = buildSectionBlocks({ featured, items, baseUrl: base, intro: state.intro });
    const html = renderPreviewDocument(blocks, { title: state.title, subtitle: state.subtitle });
    const cardsHtml = blocks.find((b) => b.type === "html")?.html ?? "";
    preview = { html, cardsHtml, count: items.length + (featured ? 1 : 0) };
  }

  return (
    <>
      <PageHeader
        title="Newsletter Events"
        description={<>Pick upcoming events and create a <strong>draft</strong> in beehiiv with a “Things to Do” section. This tool only ever creates drafts — it never schedules, publishes or sends anything. Review and send the draft in beehiiv.</>}
      />

      <div className="mb-6 space-y-3">
        {missing.length > 0 && (
          <Notice tone="warn" title="beehiiv is not configured">
            <span data-testid="missing-env">Add these Railway variables to create drafts: {missing.map((m, i) => <span key={m}>{i ? ", " : ""}<code className={code}>{m}</code></span>)}.</span> You can still pick events and preview the section.
          </Notice>
        )}
        {!fromEnv && (
          <Notice tone="warn" title="APP_URL is not set">
            Event links in the email use <code className={code}>{FALLBACK_BASE_URL}</code>. Set the <code className={code}>APP_URL</code> Railway variable so links point at the right site.
          </Notice>
        )}
        {range.error && <Notice tone="info">{range.error}</Notice>}
      </div>

      <EventsTool
        key="events-tool"
        occurrences={occurrences}
        initial={state}
        token={newRequestToken()}
        preview={preview}
        previewSig={preview ? previewSignature(state) : null}
        configured={missing.length === 0}
        archiveTag={ARCHIVE_TAG}
        draftsUrl={BEEHIIV_APP_POSTS_URL}
      />

      <Card className="mt-6" title="Drafts created by this tool" description="The last 10 drafts this tool created in beehiiv (and requests whose outcome is unknown)." bodyClassName="p-0">
        {drafts.length ? (
          <ul className="divide-y divide-slate-100" data-testid="tool-drafts">
            {drafts.map((d) => (
              <li key={d.token} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm sm:px-5" data-status={d.status}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-slate-900">{d.title}</span>
                  <span className="text-xs text-slate-500">
                    {formatDateTime(new Date(d.createdAt))} · {d.eventCount} event{d.eventCount === 1 ? "" : "s"}{d.featured ? " · featured" : ""}{d.archiveTag ? ` · tagged ${ARCHIVE_TAG}` : ""}{d.recovered ? " · found via Check beehiiv" : ""}
                  </span>
                </span>
                {d.status === "created" && d.postId ? (
                  <>
                    <span className="badge-green">Draft</span>
                    <a href={beehiivEditUrl(d.postId)} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm">Open in beehiiv</a>
                  </>
                ) : (
                  <>
                    <span className="badge-amber">Outcome unknown</span>
                    <CheckBeehiivButton token={d.token} draftsUrl={BEEHIIV_APP_POSTS_URL} compact />
                  </>
                )}
              </li>
            ))}
          </ul>
        ) : <p className="p-5 text-sm text-slate-500">No drafts created yet.</p>}
        <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500 sm:px-5">
          Can’t find a draft? All drafts are in <a href={BEEHIIV_APP_POSTS_URL} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-700 underline">beehiiv → Posts</a>. The “Open in beehiiv” link uses beehiiv’s usual editor address, which beehiiv doesn’t document.
        </p>
      </Card>

      <Card className="mt-6" title="Settings" description="Applies to every draft this tool creates.">
        <TemplateSettingsForm templateId={templateId} />
      </Card>
    </>
  );
}

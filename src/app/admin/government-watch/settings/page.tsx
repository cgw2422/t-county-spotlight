import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader, Card, Notice } from "@/components/admin/page-header";
import { ActionButton } from "@/components/admin/action-button";
import { aiConfigured, analysisModel } from "@/lib/gov-watch/analyze";
import { inboxConfigured, recordsAddress } from "@/lib/gov-watch/inbox";
import { getSetting, PAUSED_KEY, PUBLIC_KEY } from "@/lib/gov-watch/settings";
import { setGovWatchOptionAction } from "../actions";
import { BASE, daysAgo } from "../_lib";

export const dynamic = "force-dynamic";
export const metadata = { title: "Government Watch settings" };

const Row = ({ ok, label, children }: { ok: boolean; label: string; children: React.ReactNode }) => (
  <div className="flex gap-3 border-b border-slate-100 py-3 last:border-0">
    <span className={ok ? "badge-green h-fit" : "badge-amber h-fit"}>{ok ? "Ready" : "Not set up"}</span>
    <div className="min-w-0 text-sm"><p className="font-semibold text-navy-900">{label}</p><div className="mt-0.5 text-slate-600">{children}</div></div>
  </div>
);

export default async function GovWatchSettings() {
  await requireAdmin();
  const [publicOn, paused, tokens] = await Promise.all([
    getSetting<boolean>(PUBLIC_KEY), getSetting<boolean>(PAUSED_KEY),
    db.govDocument.aggregate({ where: { analyzedAt: { gte: daysAgo(30) } }, _sum: { inputTokens: true, outputTokens: true }, _count: { _all: true } }),
  ]);
  return (
    <>
      <PageHeader title="Government Watch settings" back={{ href: `${BASE}/`, label: "Government Watch" }} />
      <div className="grid max-w-3xl gap-6">
        <Card title="Setup">
          <Row ok={!!process.env.CRON_SECRET} label="Daily collection">Runs from the existing 10-minute cron job (<code>/api/cron/</code>): two overdue sources per run, so every active source is checked about once a day. {paused ? <strong>Currently paused.</strong> : null}</Row>
          <Row ok={aiConfigured()} label="AI analysis">
            {aiConfigured() ? <>Using <code>{analysisModel()}</code>. Only new or changed documents are analyzed, up to 3 per run. Last 30 days: {tokens._count._all} documents, {(tokens._sum.inputTokens ?? 0).toLocaleString()} input and {(tokens._sum.outputTokens ?? 0).toLocaleString()} output tokens.</>
              : <>Add <code>ANTHROPIC_API_KEY</code> in Railway → your service → Variables. Optional: <code>GOVWATCH_MODEL</code> to choose another Claude model (default <code>claude-opus-5-5</code>; a smaller model such as <code>claude-haiku-5-5</code> costs less per document).</>}
          </Row>
          <Row ok={inboxConfigured()} label="Records email inbox">
            {inboxConfigured() ? <>Checked every 30 minutes: <strong>{recordsAddress()}</strong>. Documents emailed from a source’s clerk address are filed under that source.</>
              : <>Create a mailbox such as <strong>records@tcountyconnect.com</strong> with your email provider, then add <code>GOVWATCH_IMAP_HOST</code>, <code>GOVWATCH_IMAP_USER</code>, <code>GOVWATCH_IMAP_PASSWORD</code> (an app password) and optionally <code>GOVWATCH_IMAP_PORT</code> (993) and <code>GOVWATCH_RECORDS_EMAIL</code> in Railway. Unread emails are imported and marked as read.</>}
          </Row>
        </Card>
        <Card title="Automatic collection">
          <p className="mb-3 text-sm text-slate-600">Pause daily website checks, inbox reading and analysis (Check Now and uploads still work).</p>
          <ActionButton action={setGovWatchOptionAction} fields={{ key: PAUSED_KEY, value: paused ? "" : "on" }} className="btn-secondary btn-sm" reloadOnSuccess>{paused ? "Resume automatic collection" : "Pause automatic collection"}</ActionButton>
        </Card>
        <Card title="Public Government Watch section">
          <div className="mb-3"><Notice tone={publicOn ? "success" : "info"} title={publicOn ? "Live at /government-watch/" : "Off (not visible to the public)"}>
            When turned on, residents can browse government activity by community, meeting summaries, original documents, upcoming public meetings and related articles at <code>/government-watch/</code>. Only stories you’ve marked Reviewed or Published are shown there, never unreviewed AI output.
          </Notice></div>
          <ActionButton action={setGovWatchOptionAction} fields={{ key: PUBLIC_KEY, value: publicOn ? "" : "on" }} className={publicOn ? "btn-secondary btn-sm" : "btn-primary btn-sm"} reloadOnSuccess
            confirm={publicOn ? undefined : { title: "Turn on the public section?", body: "Reviewed and published stories, meeting summaries and original documents become visible at /government-watch/.", confirmLabel: "Turn on" }}>
            {publicOn ? "Turn off the public section" : "Turn on the public section"}
          </ActionButton>
        </Card>
      </div>
    </>
  );
}

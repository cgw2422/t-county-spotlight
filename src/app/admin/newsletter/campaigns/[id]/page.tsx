import { notFound } from "next/navigation";
import { CalendarClock, Check, Pause, Play, RotateCcw, Send, Trash2, Undo2, XCircle } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateTime, toDateInput } from "@/lib/utils";
import { normalizeContent } from "@/lib/newsletter/content";
import { broadcastReadiness, computeStats, renderCampaign } from "@/lib/newsletter/send";
import { personalize, recipientLinks } from "@/lib/newsletter/render";
import { PageHeader, Card, Notice } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { ActionButton, ConfirmButton } from "@/components/admin/action-button";
import { ActionForm, Submit } from "@/components/admin/action-form";
import { TextField } from "@/components/admin/form-field";
import {
  approveCampaignAction, cancelScheduleAction, deleteCampaignAction, resumeCampaignAction, returnToDraftAction,
  scheduleCampaignAction, sendNowAction, sendTestAction, stopSendingAction,
} from "../../actions";
import { CampaignEditor } from "./editor";
import { AutoRefresh, EmailPreview } from "./preview";

export const dynamic = "force-dynamic";
export const metadata = { title: "Campaign" };

function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-0.5 text-xl font-bold tabular-nums text-navy-950">{typeof value === "number" ? value.toLocaleString() : value}</p>
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const nl = await db.newsletter.findUnique({ where: { id } });
  if (!nl) notFound();
  const [ready, stats, rendered, approver, eligible] = await Promise.all([
    broadcastReadiness(),
    computeStats(nl.id),
    renderCampaign(nl),
    nl.approvedById ? db.user.findUnique({ where: { id: nl.approvedById }, select: { name: true, email: true } }) : null,
    db.newsletterSubscriber.count({ where: { status: "ACTIVE", confirmedAt: { not: null } } }),
  ]);
  const sample = recipientLinks("preview-sample-token");
  const html = personalize(rendered.html, sample);
  const text = personalize(rendered.text, sample);
  const editable = ["DRAFT", "APPROVED", "SCHEDULED"].includes(nl.status);
  const started = !!nl.sendStartedAt;
  const lastError = (nl.stats as { lastError?: string } | null)?.lastError;
  const fields = { id: nl.id };
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  return (
    <>
      {nl.status === "SENDING" && <AutoRefresh />}
      <PageHeader
        back={{ href: "/admin/newsletter/campaigns/", label: "Campaigns" }}
        eyebrow={<StatusBadge status={nl.status} />}
        title={nl.subject}
        description={nl.sentAt ? `Sent ${formatDateTime(nl.sentAt)}` : nl.status === "SCHEDULED" && nl.scheduledFor ? `Scheduled for ${formatDateTime(nl.scheduledFor)} (Eastern)` : `Last edited ${formatDateTime(nl.updatedAt)}`}
        actions={!started && ["DRAFT", "APPROVED", "CANCELED"].includes(nl.status) ? (
          <ConfirmButton action={deleteCampaignAction} fields={fields} title="Delete this campaign?" body="This can't be undone."><Trash2 className="h-4 w-4" /> Delete</ConfirmButton>
        ) : undefined}
      />

      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <Card title="Approval & sending" description="Draft → Approve → Schedule or Send now. Any content edit after approval returns the campaign to Draft.">
            <ol className="mb-4 flex flex-wrap gap-2 text-xs font-semibold">
              {["DRAFT", "APPROVED", "SCHEDULED", "SENDING", "SENT"].map((s, i) => {
                const order = ["DRAFT", "APPROVED", "SCHEDULED", "SENDING", "SENT"];
                const cur = order.indexOf(nl.status);
                const done = cur >= i || (s === "SCHEDULED" && cur >= 3);
                return <li key={s} className={done ? "rounded-full bg-brand-50 px-2.5 py-1 text-brand-700" : "rounded-full bg-slate-100 px-2.5 py-1 text-slate-500"}>{i + 1}. {s.charAt(0) + s.slice(1).toLowerCase()}</li>;
              })}
            </ol>
            {approver && nl.approvedAt && <p className="mb-3 text-sm text-slate-600">Approved by <strong>{approver.name || approver.email}</strong> on {formatDateTime(nl.approvedAt)}.</p>}
            {!ready.ok && ["APPROVED", "SCHEDULED", "FAILED"].includes(nl.status) && (
              <div className="mb-4"><Notice tone="warn" title="Sending is blocked"><ul className="list-disc pl-5">{ready.problems.map((p) => <li key={p}>{p}</li>)}</ul></Notice></div>
            )}
            {lastError && ["SCHEDULED", "FAILED", "APPROVED"].includes(nl.status) && <div className="mb-4"><Notice tone="danger" title="Last attempt failed">{lastError}</Notice></div>}

            {nl.status === "DRAFT" && (
              <div className="flex flex-wrap gap-2">
                <ActionButton action={approveCampaignAction} fields={fields} className="btn-primary" confirm={{ title: "Approve this campaign?", body: "Check the preview and send yourself a test first. Approval is recorded with your name.", confirmLabel: "Approve" }}><Check className="h-4 w-4" /> Approve</ActionButton>
              </div>
            )}
            {nl.status === "APPROVED" && (
              <div className="space-y-4">
                <ActionForm action={scheduleCampaignAction} className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <input type="hidden" name="id" value={nl.id} />
                  <TextField name="scheduledFor" type="datetime-local" label="Send at (Eastern time)" required defaultValue={toDateInput(tomorrow)} wrapClassName="flex-1" />
                  <Submit className="btn-secondary" pendingText="Scheduling…"><CalendarClock className="h-4 w-4" /> Schedule</Submit>
                </ActionForm>
                <div className="flex flex-wrap gap-2">
                  <ActionButton action={sendNowAction} fields={fields} className="btn-primary" confirm={{ title: "Send this campaign now?", body: `It goes to about ${eligible.toLocaleString()} confirmed subscriber(s), minus anyone on the suppression list. This can't be undone.`, confirmLabel: "Send now" }}><Send className="h-4 w-4" /> Send now</ActionButton>
                  <ActionButton action={returnToDraftAction} fields={fields}><Undo2 className="h-4 w-4" /> Back to draft</ActionButton>
                </div>
              </div>
            )}
            {nl.status === "SCHEDULED" && (
              <div className="flex flex-wrap gap-2">
                <ActionButton action={cancelScheduleAction} fields={fields} confirm={{ title: "Cancel the schedule?", body: "The campaign stays approved; you can schedule it again.", confirmLabel: "Cancel schedule" }}><XCircle className="h-4 w-4" /> Cancel schedule</ActionButton>
                <ActionButton action={returnToDraftAction} fields={fields}><Undo2 className="h-4 w-4" /> Back to draft</ActionButton>
              </div>
            )}
            {nl.status === "SENDING" && (
              <div className="space-y-3">
                <p className="text-sm text-slate-700">Sending in batches… {stats.queued.toLocaleString()} left in the queue. Remaining batches continue on the next scheduled run if this stops.</p>
                <ActionButton action={stopSendingAction} fields={fields} confirm={{ title: "Stop sending?", body: "Queued emails won't be sent. People who already received it aren't affected.", confirmLabel: "Stop", danger: true }}><Pause className="h-4 w-4" /> Stop sending</ActionButton>
              </div>
            )}
            {nl.status === "FAILED" && (
              <div className="flex flex-wrap gap-2">
                <ActionButton action={resumeCampaignAction} fields={fields} className="btn-primary"><Play className="h-4 w-4" /> Resume sending</ActionButton>
                <ActionButton action={stopSendingAction} fields={fields} confirm={{ title: "Cancel the rest of this send?", confirmLabel: "Cancel", danger: true }}><RotateCcw className="h-4 w-4" /> Cancel remaining</ActionButton>
              </div>
            )}
            {(nl.status === "SENT" || nl.status === "CANCELED") && <p className="text-sm text-slate-600">{nl.status === "SENT" ? "This campaign has been sent." : "This campaign was canceled."}</p>}
          </Card>

          {started && (
            <Card title="Delivery">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Recipients" value={nl.recipientCount} />
                <Stat label="Sent" value={stats.sent} />
                <Stat label="Queued" value={stats.queued} />
                <Stat label="Failed / skipped" value={`${stats.failed} / ${stats.skipped}`} />
              </div>
              {stats.reported ? (
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
                  <Stat label="Delivered" value={stats.delivered} />
                  <Stat label="Opened" value={stats.opened} hint="Approximate (image-based)" />
                  <Stat label="Clicked" value={stats.clicked} />
                  <Stat label="Bounced" value={stats.bounced} />
                  <Stat label="Complaints" value={stats.complained} />
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate-500">Delivery statistics will appear when your email provider reports them.</p>
              )}
            </Card>
          )}

          {editable ? (
            <CampaignEditor id={nl.id} subject={nl.subject} preheader={nl.preheader ?? ""} content={normalizeContent(nl.content)} status={nl.status} />
          ) : (
            <Notice tone="info">This campaign {nl.status === "SENT" ? "was sent" : "has started sending"}, so its content is locked.</Notice>
          )}
        </div>

        <div className="min-w-0 space-y-6">
          <Card title="Preview" description="Saved version. Unsubscribe and preferences links are personalized for each recipient.">
            <EmailPreview html={html} text={text} />
          </Card>
          <Card title="Send a test" description="Goes only to the addresses you enter, with “[TEST]” in the subject.">
            <ActionForm action={sendTestAction} className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <input type="hidden" name="id" value={nl.id} />
              <TextField name="emails" label="Email addresses" placeholder="you@example.com, editor@example.com" required wrapClassName="flex-1" />
              <Submit className="btn-secondary" pendingText="Sending…"><Send className="h-4 w-4" /> Send test</Submit>
            </ActionForm>
          </Card>
        </div>
      </div>
    </>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { Trash2, UserMinus } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import { SOURCE_LABELS, TOPICS, readPreferences } from "@/lib/newsletter/copy";
import { PageHeader, Card, Notice } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { ActionButton, ConfirmButton } from "@/components/admin/action-button";
import { adminUnsubscribeAction, deleteSubscriberAction } from "../../actions";
import { EVENT_LABELS } from "../../labels";

export const dynamic = "force-dynamic";
export const metadata = { title: "Subscriber" };

export default async function SubscriberDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const sub = await db.newsletterSubscriber.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true } },
      events: { orderBy: { createdAt: "desc" }, take: 200 },
      sends: { orderBy: { createdAt: "desc" }, take: 100, include: { newsletter: { select: { id: true, subject: true } } } },
    },
  });
  if (!sub) notFound();
  const suppression = await db.emailSuppression.findUnique({ where: { email: sub.email } });
  const prefs = readPreferences(sub.preferences);
  const rows: [string, React.ReactNode][] = [
    ["Status", <StatusBadge key="s" status={sub.status} />],
    ["First name", sub.firstName || "—"],
    ["Signup source", SOURCE_LABELS[sub.source] ?? sub.source],
    ["Consent given", sub.consentAt ? formatDateTime(sub.consentAt) : "—"],
    ["Consent version", sub.consentVersion || "—"],
    ["Confirmed", sub.confirmedAt ? formatDateTime(sub.confirmedAt) : "Not confirmed"],
    ["Unsubscribed", sub.unsubscribedAt ? `${formatDateTime(sub.unsubscribedAt)}${sub.unsubscribeReason ? ` — “${sub.unsubscribeReason}”` : ""}` : "—"],
    ["Member account", sub.user ? <Link key="u" href={`/admin/users/${sub.user.id}/`} className="font-semibold text-brand-700 hover:underline">{sub.user.name || sub.user.email}</Link> : "—"],
    ["Topics", TOPICS.filter((t) => prefs[t.key]).map((t) => t.label).join(", ") || "None"],
  ];
  return (
    <>
      <PageHeader
        back={{ href: "/admin/newsletter/subscribers/", label: "Subscribers" }}
        title={<span className="break-all">{sub.email}</span>}
        actions={
          <>
            {(sub.status === "ACTIVE" || sub.status === "PENDING") && (
              <ActionButton action={adminUnsubscribeAction} fields={{ id: sub.id }} confirm={{ title: "Unsubscribe this person?", body: "They stop receiving the newsletter and are added to the suppression list.", confirmLabel: "Unsubscribe", danger: true }}>
                <UserMinus className="h-4 w-4" /> Unsubscribe
              </ActionButton>
            )}
            <ConfirmButton action={deleteSubscriberAction} fields={{ id: sub.id, redirect: "1" }} title="Delete this subscriber?" body="Removes the subscriber and their history. The address stays on the suppression list.">
              <Trash2 className="h-4 w-4" /> Delete
            </ConfirmButton>
          </>
        }
      />
      {suppression && <div className="mb-6"><Notice tone="warn" title="On the suppression list">Reason: {suppression.reason} · since {formatDateTime(suppression.createdAt)}. This address is never emailed unless they sign up again and confirm.</Notice></div>}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="space-y-6">
          <Card title="Details">
            <dl className="divide-y divide-slate-100 text-sm">
              {rows.map(([k, v]) => (
                <div key={k} className="grid grid-cols-[9rem_1fr] gap-3 py-2"><dt className="text-slate-500">{k}</dt><dd className="min-w-0 break-words text-slate-800">{v}</dd></div>
              ))}
            </dl>
            {sub.consentText && <details className="mt-3 text-sm"><summary className="cursor-pointer font-medium text-slate-700">Consent wording shown</summary><p className="mt-2 rounded-lg bg-slate-50 p-3 text-slate-600">{sub.consentText}</p></details>}
          </Card>
          <Card title="Send history" bodyClassName="p-0">
            {sub.sends.length ? (
              <ul className="divide-y divide-slate-100">
                {sub.sends.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm sm:px-5">
                    <span className="min-w-0">
                      <Link href={`/admin/newsletter/campaigns/${s.newsletter.id}/`} className="block truncate font-medium text-slate-800 hover:text-brand-700">{s.newsletter.subject}</Link>
                      <span className="text-xs text-slate-500">{s.sentAt ? formatDateTime(s.sentAt) : formatDateTime(s.createdAt)}{s.openedAt ? " · opened" : ""}{s.clickedAt ? " · clicked" : ""}{s.error ? ` · ${s.error}` : ""}</span>
                    </span>
                    <StatusBadge status={s.status} />
                  </li>
                ))}
              </ul>
            ) : <p className="p-5 text-sm text-slate-500">No campaigns sent to this address yet.</p>}
          </Card>
        </div>
        <Card title="Activity" bodyClassName="p-0">
          <ol className="relative ml-6 border-l border-slate-200 py-4 pr-4">
            {sub.events.map((e) => (
              <li key={e.id} className="mb-4 ml-4 last:mb-0">
                <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-brand-500" aria-hidden />
                <p className="text-sm font-semibold text-slate-800">{EVENT_LABELS[e.type] ?? e.type}</p>
                <p className="text-xs text-slate-500">{formatDateTime(e.createdAt)}{e.data && typeof e.data === "object" ? ` · ${Object.entries(e.data as Record<string, unknown>).filter(([k]) => k !== "svixId").map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`).join(", ")}` : ""}</p>
              </li>
            ))}
            {!sub.events.length && <li className="ml-4 text-sm text-slate-500">No activity recorded.</li>}
          </ol>
        </Card>
      </div>
    </>
  );
}

import Link from "next/link";
import { Ban, Clock, MailCheck, Plus, Users } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import { SOURCE_LABELS } from "@/lib/newsletter/copy";
import { broadcastReadiness } from "@/lib/newsletter/send";
import { PageHeader, Card, Notice } from "@/components/admin/page-header";
import { StatCard } from "@/components/admin/stat-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { createCampaignAction } from "./actions";
import { EVENT_LABELS } from "./labels";

export const dynamic = "force-dynamic";
export const metadata = { title: "Newsletter" };

export default async function NewsletterOverview() {
  await requireAdmin();
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const [byStatus, recentBySource, confirmedBySource, activity, ready, nextCampaign] = await Promise.all([
    db.newsletterSubscriber.groupBy({ by: ["status"], _count: { _all: true } }),
    db.newsletterSubscriber.groupBy({ by: ["source"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
    db.newsletterSubscriber.groupBy({ by: ["source"], where: { confirmedAt: { gte: since }, status: "ACTIVE" }, _count: { _all: true } }),
    db.subscriberEvent.findMany({ orderBy: { createdAt: "desc" }, take: 15, include: { subscriber: { select: { id: true, email: true } } } }),
    broadcastReadiness(),
    db.newsletter.findFirst({ where: { status: { in: ["SCHEDULED", "SENDING"] } }, orderBy: { scheduledFor: "asc" } }),
  ]);
  const n = (s: string) => byStatus.find((g) => g.status === s)?._count._all ?? 0;
  const total = byStatus.reduce((a, g) => a + g._count._all, 0);
  const sources = [...new Set([...recentBySource.map((r) => r.source), ...confirmedBySource.map((r) => r.source)])]
    .map((source) => ({ source, signups: recentBySource.find((r) => r.source === source)?._count._all ?? 0, confirmed: confirmedBySource.find((r) => r.source === source)?._count._all ?? 0 }))
    .sort((a, b) => b.signups - a.signups);
  const max = Math.max(1, ...sources.map((s) => s.signups));

  return (
    <>
      <PageHeader
        title="T-County Weekly"
        description="Permission-based email newsletter. Everyone on this list asked to subscribe and confirmed their address."
        actions={<form action={createCampaignAction}><button className="btn-primary"><Plus className="h-4 w-4" /> New campaign</button></form>}
      />
      {!ready.ok && (
        <div className="mb-6">
          <Notice tone="warn" title="Broadcasts are turned off until setup is complete">
            <ul className="list-disc pl-5">{ready.problems.map((p) => <li key={p}>{p}</li>)}</ul>
            <p className="mt-1">Signups and confirmation emails still work{ready.provider ? "" : " (written to the server log until a provider is configured)"}. <Link href="/admin/newsletter/settings/" className="font-semibold underline">Open settings</Link></p>
          </Notice>
        </div>
      )}
      {nextCampaign && (
        <div className="mb-6"><Notice tone="info" title={nextCampaign.status === "SENDING" ? "A campaign is sending" : "Next scheduled campaign"}><Link href={`/admin/newsletter/campaigns/${nextCampaign.id}/`} className="font-semibold underline">{nextCampaign.subject}</Link>{nextCampaign.scheduledFor && nextCampaign.status === "SCHEDULED" && <> — {formatDateTime(nextCampaign.scheduledFor)}</>}</Notice></div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Total" value={total} icon={Users} tone="navy" href="/admin/newsletter/subscribers/" />
        <StatCard label="Active (confirmed)" value={n("ACTIVE")} icon={MailCheck} tone="green" href="/admin/newsletter/subscribers/?status=ACTIVE" />
        <StatCard label="Pending confirmation" value={n("PENDING")} icon={Clock} tone="amber" href="/admin/newsletter/subscribers/?status=PENDING" />
        <StatCard label="Unsubscribed" value={n("UNSUBSCRIBED")} icon={Ban} tone="blue" href="/admin/newsletter/subscribers/?status=UNSUBSCRIBED" />
        <StatCard label="Bounced / complained" value={n("BOUNCED") + n("COMPLAINED")} icon={Ban} tone="orange" href="/admin/newsletter/suppressions/" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="min-w-0" title="Signups in the last 30 days" description="New signup requests by where they happened, and how many of those people confirmed.">
          {sources.length ? (
            <ul className="space-y-3">
              {sources.map((s) => (
                <li key={s.source}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-medium text-slate-800">{SOURCE_LABELS[s.source] ?? s.source}</span>
                    <span className="tabular-nums text-slate-600"><strong className="text-slate-900">{s.signups}</strong> signups · {s.confirmed} confirmed</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                    <div className="h-full rounded-full bg-brand-500" style={{ width: `${(s.signups / max) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-slate-500">No signups in the last 30 days yet.</p>}
        </Card>

        <Card className="min-w-0" title="Recent activity" bodyClassName="p-0">
          {activity.length ? (
            <ul className="divide-y divide-slate-100">
              {activity.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm sm:px-5">
                  <span className="min-w-0">
                    <Link href={`/admin/newsletter/subscribers/${e.subscriber.id}/`} className="block truncate font-medium text-slate-800 hover:text-brand-700">{e.subscriber.email}</Link>
                    <span className="text-xs text-slate-500">{formatDateTime(e.createdAt)}</span>
                  </span>
                  <StatusBadge status={e.type} label={EVENT_LABELS[e.type] ?? e.type} />
                </li>
              ))}
            </ul>
          ) : <p className="p-5 text-sm text-slate-500">No activity yet.</p>}
        </Card>
      </div>
    </>
  );
}

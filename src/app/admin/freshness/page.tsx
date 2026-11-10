import Link from "next/link";
import { Archive, ExternalLink, EyeOff, Inbox, Lock, StarOff, Trash2 } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import { Card, PageHeader } from "@/components/admin/page-header";
import { ActionButton } from "@/components/admin/action-button";
import { endedSaleWhere } from "@/lib/garage-sales";
import { formatSaleDates } from "@/lib/garage-sales-shared";
import { setEventStatus } from "../events/actions";
import { setPromotionStatus } from "../specials/actions";
import { moderateNeed, moderateOpportunity } from "../organizations/actions";
import { archiveEndedGarageSales, setGarageSaleStatus } from "../garage-sales/actions";
import { pendingCounts } from "../submissions/data";
import { bulkFreshness, unfeatureArticle } from "./actions";
import { freshnessWhere } from "./data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Content freshness" };

const SHOW = 8;
const short = (d: Date | null | undefined) => formatDate(d, { month: "short", day: "numeric", year: "numeric" });

type Item = { id: string; title: string; href: string; meta: string; action?: React.ReactNode };

function Section({ id, title, description, count, bulk, items, empty, more }: {
  id: string; title: string; description: string; count: number; bulk?: React.ReactNode; items: Item[]; empty: string; more?: string;
}) {
  return (
    <Card
      id={id}
      title={<span className="flex items-center gap-2">{title} <span className={count ? "badge-amber" : "badge-gray"}>{count}</span></span>}
      description={description}
      actions={count > 0 ? bulk : undefined}
      bodyClassName="p-0"
    >
      {items.length ? (
        <ul className="divide-y divide-slate-100">
          {items.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
              <div className="min-w-0 flex-1">
                <Link href={i.href} className="font-medium text-slate-900 hover:text-brand-700">{i.title}</Link>
                <p className="text-xs text-slate-500">{i.meta}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {i.action}
                <Link href={i.href} className="btn-ghost btn-sm" aria-label={`Open ${i.title}`}><ExternalLink className="h-4 w-4" /> Open</Link>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-4 py-6 text-sm text-slate-500 sm:px-5">{empty}</p>
      )}
      {count > items.length && <p className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500 sm:px-5">Showing {items.length} of {count}.{more && <> <Link href={more} className="font-semibold text-brand-700">See all</Link></>}</p>}
    </Card>
  );
}

const bulkBtn = (kind: string, label: string, title: string, body: string) => (
  <ActionButton action={bulkFreshness} fields={{ kind }} confirm={{ title, body, confirmLabel: label }} className="btn-secondary btn-sm" reloadOnSuccess><Archive className="h-4 w-4" /> {label}</ActionButton>
);

export default async function FreshnessPage() {
  await requireStaff();
  const now = new Date();
  const w = freshnessWhere(now);
  const gsWhere = endedSaleWhere(now);
  const [
    evCount, events, gsCount, sales, spCount, specials, needCount, needs, oppCount, opps, annCount, anns, ftCount, trucks, pending,
  ] = await Promise.all([
    db.event.count({ where: w.endedEvents }),
    db.event.findMany({ where: w.endedEvents, orderBy: { startAt: "desc" }, take: SHOW, select: { id: true, title: true, startAt: true, endAt: true, city: true } }),
    db.garageSale.count({ where: gsWhere }),
    db.garageSale.findMany({ where: gsWhere, orderBy: { endDate: "desc" }, take: SHOW, select: { id: true, title: true, startDate: true, endDate: true, city: true } }),
    db.promotion.count({ where: w.expiredSpecials }),
    db.promotion.findMany({ where: w.expiredSpecials, orderBy: { endsAt: "desc" }, take: SHOW, select: { id: true, title: true, endsAt: true, business: { select: { name: true } } } }),
    db.communityNeed.count({ where: w.pastDeadlineNeeds }),
    db.communityNeed.findMany({ where: w.pastDeadlineNeeds, orderBy: { deadline: "asc" }, take: SHOW, select: { id: true, title: true, deadline: true, organization: { select: { name: true } } } }),
    db.volunteerOpportunity.count({ where: w.endedOpportunities }),
    db.volunteerOpportunity.findMany({ where: w.endedOpportunities, orderBy: { startAt: "desc" }, take: SHOW, select: { id: true, title: true, startAt: true, endAt: true, organization: { select: { name: true } } } }),
    db.article.count({ where: w.oldAnnouncements }),
    db.article.findMany({ where: w.oldAnnouncements, orderBy: [{ isFeatured: "desc" }, { publishedAt: "asc" }], take: SHOW, select: { id: true, title: true, publishedAt: true, isFeatured: true } }),
    db.business.count({ where: w.staleFoodTrucks }),
    db.business.findMany({ where: w.staleFoodTrucks, orderBy: { name: "asc" }, take: SHOW, select: { id: true, name: true, city: true, foodTruckStops: { orderBy: { updatedAt: "desc" }, take: 1, select: { updatedAt: true } } } }),
    pendingCounts(),
  ]);

  const summary = [
    { href: "#ended-events", label: "Ended events", n: evCount },
    { href: "#expired-sales", label: "Expired garage sales", n: gsCount },
    { href: "#expired-specials", label: "Expired specials", n: spCount },
    { href: "#needs", label: "Needs past deadline", n: needCount },
    { href: "#volunteer", label: "Ended volunteer opportunities", n: oppCount },
    { href: "#announcements", label: "Announcements over 60 days", n: annCount },
    { href: "#food-trucks", label: "Food trucks without a current schedule", n: ftCount },
  ];

  return (
    <>
      <PageHeader title="Content freshness" description="Content whose dates have passed. Past items are already hidden from upcoming lists; clean-up keeps admin lists and featured spots tidy. Every action is audit-logged." />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/admin/submissions/" className="card card-hover flex items-center gap-3 p-4">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-50 text-amber-700"><Inbox className="h-5 w-5" /></span>
          <span><span className="block text-2xl font-bold text-slate-900">{pending.total}</span><span className="text-sm text-slate-600">Submissions awaiting approval</span></span>
        </Link>
        {summary.map((s) => (
          <a key={s.href} href={s.href} className="card card-hover p-4">
            <span className="block text-2xl font-bold text-slate-900">{s.n}</span>
            <span className="text-sm text-slate-600">{s.label}</span>
          </a>
        ))}
      </div>
      <div className="space-y-6">
        <Section id="ended-events" title="Ended events" description="One-time published events that have finished. They no longer show as upcoming. Recurring events are not included."
          count={evCount} empty="No ended one-time events." more="/admin/events/?tab=past"
          bulk={bulkBtn("events", "Archive all ended", "Archive all ended events?", "They move to the Archived tab and stay out of public lists. Their pages stop showing.")}
          items={events.map((e) => ({ id: e.id, title: e.title, href: `/admin/events/${e.id}/`, meta: `Ended ${short(e.endAt ?? e.startAt)}${e.city ? ` · ${e.city}` : ""}`,
            action: <ActionButton action={setEventStatus} fields={{ id: e.id, status: "ARCHIVED" }} className="btn-secondary btn-sm" reloadOnSuccess><Archive className="h-4 w-4" /> Archive</ActionButton> }))} />

        <Section id="expired-sales" title="Expired garage sales" description="Published sales whose last day has passed. They're hidden automatically; archiving moves them to Removed."
          count={gsCount} empty="No expired garage sales." more="/admin/garage-sales/?tab=ended"
          bulk={<ActionButton action={archiveEndedGarageSales} confirm={{ title: "Archive all ended garage sales?", body: "They move to the Removed tab.", confirmLabel: "Archive all ended" }} className="btn-secondary btn-sm" reloadOnSuccess><Archive className="h-4 w-4" /> Archive all ended</ActionButton>}
          items={sales.map((s) => ({ id: s.id, title: s.title, href: `/admin/garage-sales/${s.id}/`, meta: `${formatSaleDates(s.startDate, s.endDate)}${s.city ? ` · ${s.city}` : ""}`,
            action: <ActionButton action={setGarageSaleStatus} fields={{ id: s.id, status: "REMOVED" }} className="btn-secondary btn-sm" reloadOnSuccess><Trash2 className="h-4 w-4" /> Archive</ActionButton> }))} />

        <Section id="expired-specials" title="Expired specials" description="Approved specials whose end date has passed (already hidden publicly)."
          count={spCount} empty="No expired specials."
          bulk={bulkBtn("specials", "Unpublish all expired", "Unpublish all expired specials?", "Business owners can still see and renew them in their dashboard.")}
          items={specials.map((p) => ({ id: p.id, title: p.title, href: `/admin/specials/${p.id}/`, meta: `${p.business.name} · ended ${short(p.endsAt)}`,
            action: <ActionButton action={setPromotionStatus} fields={{ id: p.id, status: "UNPUBLISHED" }} className="btn-secondary btn-sm" reloadOnSuccess><EyeOff className="h-4 w-4" /> Unpublish</ActionButton> }))} />

        <Section id="needs" title="Community needs past deadline" description="Open or partly fulfilled needs whose deadline has passed."
          count={needCount} empty="No needs are past their deadline." more="/admin/needs/"
          bulk={bulkBtn("needs", "Close all past deadline", "Close all needs past their deadline?", "Organizations can reopen a need from their dashboard.")}
          items={needs.map((n) => ({ id: n.id, title: n.title, href: "/admin/needs/", meta: `${n.organization.name} · deadline ${short(n.deadline)}`,
            action: <ActionButton action={moderateNeed} fields={{ needId: n.id, op: "close" }} className="btn-secondary btn-sm" reloadOnSuccess><Lock className="h-4 w-4" /> Close</ActionButton> }))} />

        <Section id="volunteer" title="Ended volunteer opportunities" description="Published, non-ongoing opportunities whose date has passed."
          count={oppCount} empty="No ended volunteer opportunities." more="/admin/volunteer/"
          bulk={bulkBtn("opportunities", "Close all ended", "Close all ended volunteer opportunities?", "Sign-ups close; the history stays.")}
          items={opps.map((o) => ({ id: o.id, title: o.title, href: `/admin/volunteer/${o.id}/`, meta: `${o.organization.name} · ${short(o.endAt ?? o.startAt)}`,
            action: <ActionButton action={moderateOpportunity} fields={{ oppId: o.id, op: "close" }} className="btn-secondary btn-sm" reloadOnSuccess><Lock className="h-4 w-4" /> Close</ActionButton> }))} />

        <Section id="announcements" title="Community announcements older than 60 days" description="Consider unfeaturing or unpublishing time-sensitive announcements. Featured ones are listed first."
          count={annCount} empty="No announcements older than 60 days." more="/admin/articles/"
          items={anns.map((a) => ({ id: a.id, title: a.title, href: `/admin/articles/${a.id}/`, meta: `Published ${short(a.publishedAt)}${a.isFeatured ? " · Featured" : ""}`,
            action: a.isFeatured ? <ActionButton action={unfeatureArticle} fields={{ id: a.id }} className="btn-secondary btn-sm" reloadOnSuccess><StarOff className="h-4 w-4" /> Unfeature</ActionButton> : undefined }))} />

        <Section id="food-trucks" title="Food trucks with outdated schedules" description="Published food trucks with no upcoming stops and no schedule change in 14 days. Ask the owner to update their stops."
          count={ftCount} empty="Every food truck has a current schedule."
          items={trucks.map((b) => ({ id: b.id, title: b.name, href: `/admin/businesses/${b.id}/`, meta: `${b.city ?? "—"} · ${b.foodTruckStops[0] ? `schedule last changed ${short(b.foodTruckStops[0].updatedAt)}` : "no stops entered yet"}` }))} />
      </div>
    </>
  );
}

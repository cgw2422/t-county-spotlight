import Link from "next/link";
import {
  Store, FileText, FilePen, ClipboardList, CalendarDays, CalendarClock, BadgePercent, Hourglass, Users, CreditCard,
  Plus, Activity, BarChart3,
} from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { upcomingEventWhere } from "@/lib/events";
import { activePromotionWhere } from "@/lib/promotions";
import { formatDateTime } from "@/lib/utils";
import { PageHeader, Card } from "@/components/admin/page-header";
import { StatCard } from "@/components/admin/stat-card";
import { publishDueScheduled } from "./_lib/scheduling";
import { describeAudit } from "./audit/describe";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard" };

const ENGAGEMENT_LABELS: Record<string, string> = {
  view_business: "Business page views", view_event: "Event views", view_promotion: "Special views", view_article: "Article views",
  click_website: "Website clicks", click_phone: "Phone taps", click_directions: "Directions requests", save: "Saves",
};

export default async function AdminDashboard() {
  const user = await requireStaff();
  await publishDueScheduled();
  const now = new Date();
  const since = new Date(now.getTime() - 30 * 86400_000);
  const activeSub = { status: { in: ["ACTIVE", "TRIALING"] as ("ACTIVE" | "TRIALING")[] }, OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gte: now } }] };
  const [
    businesses, published, drafts, scheduled, pendingArticles, applications, upcomingEvents, pendingEvents, activePromos, pendingPromos, users,
    paidSubs, compSubs, engagement, activity,
  ] = await Promise.all([
    db.business.count({ where: { deletedAt: null } }),
    db.article.count({ where: { status: "PUBLISHED", deletedAt: null } }),
    db.article.count({ where: { status: "DRAFT", deletedAt: null } }),
    db.article.count({ where: { status: "SCHEDULED", deletedAt: null } }),
    db.article.count({ where: { status: "PENDING", deletedAt: null } }),
    db.businessApplication.count({ where: { status: "PENDING" } }),
    db.event.count({ where: upcomingEventWhere(now) }),
    db.event.count({ where: { status: "PENDING", deletedAt: null } }),
    db.promotion.count({ where: activePromotionWhere(now) }),
    db.promotion.count({ where: { status: "PENDING", deletedAt: null } }),
    db.user.count({ where: { status: { not: "DELETED" } } }),
    db.subscription.count({ where: { ...activeSub, source: "stripe" } }),
    db.subscription.count({ where: { ...activeSub, source: "manual" } }),
    db.engagementEvent.groupBy({ by: ["type"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
    db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 12, include: { user: { select: { name: true, email: true } } } }),
  ]);
  const engagementTotal = engagement.reduce((n, e) => n + e._count._all, 0);
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: "America/New_York" }).format(now));
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <>
      <PageHeader
        title={`${greeting}${user.name ? `, ${user.name.split(" ")[0]}` : ""}`}
        description="Here’s what’s happening across TCountySpotlight."
        actions={
          <>
            <Link href="/admin/articles/new/" className="btn-primary btn-sm"><Plus className="h-4 w-4" /> New article</Link>
            <Link href="/admin/businesses/new/" className="btn-secondary btn-sm"><Plus className="h-4 w-4" /> Add business</Link>
            <Link href="/admin/events/new/" className="btn-secondary btn-sm"><Plus className="h-4 w-4" /> Create event</Link>
            <Link href="/admin/specials/new/" className="btn-secondary btn-sm"><Plus className="h-4 w-4" /> Add special</Link>
          </>
        }
      />

      {(applications > 0 || pendingEvents > 0 || pendingPromos > 0 || pendingArticles > 0) && (
        <div className="mb-6 flex flex-wrap gap-2">
          {applications > 0 && <Link href="/admin/applications/" className="badge-amber min-h-9 px-3 text-sm">{applications} business application{applications === 1 ? "" : "s"} to review →</Link>}
          {pendingEvents > 0 && <Link href="/admin/events/?tab=pending" className="badge-amber min-h-9 px-3 text-sm">{pendingEvents} event submission{pendingEvents === 1 ? "" : "s"} to review →</Link>}
          {pendingPromos > 0 && <Link href="/admin/specials/?status=PENDING" className="badge-amber min-h-9 px-3 text-sm">{pendingPromos} special{pendingPromos === 1 ? "" : "s"} awaiting approval →</Link>}
          {pendingArticles > 0 && <Link href="/admin/articles/?tab=pending" className="badge-amber min-h-9 px-3 text-sm">{pendingArticles} article{pendingArticles === 1 ? "" : "s"} submitted for review →</Link>}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-5">
        <StatCard label="Businesses" value={businesses} icon={Store} href="/admin/businesses/" />
        <StatCard label="Published articles" value={published} icon={FileText} href="/admin/articles/?tab=published" tone="green" hint={scheduled ? `${scheduled} scheduled` : undefined} />
        <StatCard label="Draft articles" value={drafts} icon={FilePen} href="/admin/articles/?tab=drafts" tone="navy" />
        <StatCard label="Pending applications" value={applications} icon={ClipboardList} href="/admin/applications/" tone="amber" />
        <StatCard label="Upcoming events" value={upcomingEvents} icon={CalendarDays} href="/admin/events/" />
        <StatCard label="Pending event submissions" value={pendingEvents} icon={CalendarClock} href="/admin/events/?tab=pending" tone="amber" />
        <StatCard label="Active specials" value={activePromos} icon={BadgePercent} href="/admin/specials/" tone="orange" />
        <StatCard label="Pending specials" value={pendingPromos} icon={Hourglass} href="/admin/specials/?status=PENDING" tone="amber" />
        <StatCard label="Registered users" value={users} icon={Users} href={user.role === "ADMIN" ? "/admin/users/" : undefined} tone="navy" />
        <StatCard label="Active paid memberships" value={paidSubs} icon={CreditCard} href={user.role === "ADMIN" ? "/admin/memberships/?tab=subscriptions" : undefined} tone="green" hint={compSubs ? `+ ${compSubs} complimentary` : undefined} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3" title="Recent activity" description="Latest changes recorded in the audit log" actions={user.role === "ADMIN" ? <Link href="/admin/audit/" className="text-sm font-semibold text-brand-700 hover:underline">View all</Link> : undefined} bodyClassName="p-0">
          {activity.length ? (
            <ul className="divide-y divide-slate-100">
              {activity.map((a) => (
                <li key={a.id} className="flex items-start gap-3 px-4 py-3 sm:px-5">
                  <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500"><Activity className="h-4 w-4" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-800">{describeAudit(a)}</p>
                    <p className="text-xs text-slate-500">{a.user ? a.user.name || a.user.email : "System"} · {formatDateTime(a.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-10 text-center text-sm text-slate-500">No activity recorded yet.</p>
          )}
        </Card>
        <Card className="lg:col-span-2" title="Engagement · last 30 days" description="Real actions recorded on the site">
          {engagementTotal ? (
            <ul className="space-y-2.5">
              {engagement.sort((a, b) => b._count._all - a._count._all).map((e) => (
                <li key={e.type} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-slate-600">{ENGAGEMENT_LABELS[e.type] ?? e.type}</span>
                  <span className="font-semibold tabular-nums text-navy-950">{e._count._all.toLocaleString()}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="py-6 text-center">
              <BarChart3 className="mx-auto h-9 w-9 text-slate-300" />
              <p className="mt-2 font-semibold text-slate-700">No analytics yet</p>
              <p className="mx-auto mt-1 max-w-xs text-sm text-slate-500">Views and clicks will appear here as visitors use the new site. We never show estimated numbers.</p>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

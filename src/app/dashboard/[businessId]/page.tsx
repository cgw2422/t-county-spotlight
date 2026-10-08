import Link from "next/link";
import { BarChart3, CalendarPlus, Check, Circle, ExternalLink, Eye, Globe, Heart, ImagePlus, MapPin, PencilLine, Phone, Bookmark, Tag } from "lucide-react";
import { db } from "@/lib/db";
import { requireBusinessAccess } from "@/lib/auth";
import { getBusinessEntitlements } from "@/lib/entitlements";
import { businessHref } from "@/lib/links";
import { PageHeader, Panel, StatusBadge } from "@/components/dashboard/shell";
import { readHours } from "@/components/dashboard/text";

export const dynamic = "force-dynamic";

function Stat({ icon: Icon, label, value, hint }: { icon: typeof Eye; label: string; value: number; hint?: string }) {
  return (
    <div className="card p-4">
      <p className="flex items-center gap-2 text-sm font-medium text-slate-600"><Icon className="h-4 w-4 text-brand-600" aria-hidden /> {label}</p>
      <p className="mt-2 text-3xl font-bold tabular-nums text-navy-900">{value.toLocaleString()}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export default async function OverviewPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const { user, business } = await requireBusinessAccess(businessId);
  const root = `/dashboard/${business.id}/`;
  const since = new Date(Date.now() - 30 * 86400_000);
  const [{ entitlements, plan }, full, followers, saves, pendingEvents, pendingSpecials, pendingUpdates, engagement] = await Promise.all([
    getBusinessEntitlements(business.id),
    db.business.findUnique({ where: { id: business.id }, include: { categories: { select: { id: true } }, _count: { select: { photos: true } } } }),
    db.businessFollow.count({ where: { businessId: business.id } }),
    db.savedItem.count({ where: { type: "BUSINESS", targetId: business.id } }),
    db.event.count({ where: { businessId: business.id, status: "PENDING", deletedAt: null } }),
    db.promotion.count({ where: { businessId: business.id, status: "PENDING", deletedAt: null } }),
    db.businessUpdate.count({ where: { businessId: business.id, status: "PENDING" } }),
    db.engagementEvent.groupBy({ by: ["type"], where: { businessId: business.id, createdAt: { gte: since } }, _count: { _all: true } }),
  ]);
  const b = full!;
  const count = (t: string) => engagement.find((e) => e.type === t)?._count._all ?? 0;
  const hours = readHours(b.hours);

  const checklist = [
    { done: !!b.logoUrl, label: "Add your logo", href: `${root}profile/#images` },
    { done: !!b.coverUrl, label: "Add a cover photo", href: `${root}profile/#images` },
    { done: !!b.tagline, label: "Write a short tagline", href: `${root}profile/#basics` },
    { done: (b.description ?? "").replace(/<[^>]+>/g, "").trim().length >= 80, label: "Describe your business (a few sentences)", href: `${root}profile/#basics` },
    { done: b.categories.length > 0, label: "Pick a category", href: `${root}profile/#basics` },
    { done: !!b.phone, label: "Add a phone number", href: `${root}profile/#contact` },
    { done: !!(b.address && b.city), label: "Add your address", href: `${root}profile/#contact` },
    { done: !!b.website || Object.keys((b.socials as object) ?? {}).length > 0, label: "Link your website or social page", href: `${root}profile/#contact` },
    { done: hours.some((h) => h.closed || h.open), label: "Add your hours", href: `${root}profile/#hours` },
    { done: b._count.photos >= 3, label: "Upload at least 3 photos", href: `${root}photos/` },
  ];
  const doneCount = checklist.filter((c) => c.done).length;
  const pct = Math.round((doneCount / checklist.length) * 100);

  const actions = [
    { href: `${root}profile/`, label: "Edit my profile", icon: PencilLine, show: true },
    { href: `${root}photos/`, label: "Add photos", icon: ImagePlus, show: true },
    { href: `${root}events/new/`, label: "Submit an event", icon: CalendarPlus, show: entitlements.events },
    { href: `${root}specials/new/`, label: "Create a special", icon: Tag, show: entitlements.promotions },
  ].filter((a) => a.show);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Hi${user.name ? `, ${user.name.split(" ")[0]}` : ""}!`}
        description={<>Here&apos;s how <strong>{b.name}</strong> is doing on TCountySpotlight.</>}
        action={b.status === "PUBLISHED" ? <Link href={businessHref(b)} className="btn-secondary"><ExternalLink className="h-4 w-4" aria-hidden /> View my listing</Link> : undefined}
      />

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-600">Listing status:</span> <StatusBadge status={b.status} />
        <span className="ml-2 text-slate-600">Plan:</span> <span className="badge-blue">{plan?.name ?? "Free listing"}</span>
      </div>
      {b.status === "PENDING" && <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Your listing is waiting for review. You can keep filling it in — we&apos;ll let you know when it&apos;s live.</p>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {actions.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className="card card-hover flex min-h-24 flex-col items-center justify-center gap-2 p-4 text-center font-semibold text-navy-900">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><Icon className="h-6 w-6" aria-hidden /></span>
            {label}
          </Link>
        ))}
      </div>

      {(pendingEvents > 0 || pendingSpecials > 0 || pendingUpdates > 0) && (
        <Panel title="Waiting for review">
          <ul className="space-y-1 text-sm text-slate-700">
            {pendingEvents > 0 && <li><Link className="text-brand-700 hover:underline" href={`${root}events/`}>{pendingEvents} event{pendingEvents > 1 ? "s" : ""}</Link></li>}
            {pendingSpecials > 0 && <li><Link className="text-brand-700 hover:underline" href={`${root}specials/`}>{pendingSpecials} special{pendingSpecials > 1 ? "s" : ""}</Link></li>}
            {pendingUpdates > 0 && <li><Link className="text-brand-700 hover:underline" href={`${root}updates/`}>{pendingUpdates} update{pendingUpdates > 1 ? "s" : ""}</Link></li>}
          </ul>
          <p className="mt-2 text-xs text-slate-500">Our team reviews submissions, usually within a business day.</p>
        </Panel>
      )}

      <Panel title="Last 30 days" description={entitlements.analytics ? "Real activity recorded on your listing. Numbers start at zero and grow as people find you." : undefined}>
        {entitlements.analytics ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <Stat icon={Eye} label="Profile views" value={count("view_business")} />
            <Stat icon={Globe} label="Website clicks" value={count("click_website")} />
            <Stat icon={Phone} label="Phone taps" value={count("click_phone")} />
            <Stat icon={MapPin} label="Directions" value={count("click_directions")} />
            <Stat icon={Bookmark} label="Saved by members" value={saves} hint="All time" />
            <Stat icon={Heart} label="Followers" value={followers} hint="All time" />
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-[1fr_2fr] sm:items-center">
            <Stat icon={Heart} label="Followers" value={followers} hint="People following your business" />
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="flex items-center gap-2 font-semibold text-navy-900"><BarChart3 className="h-5 w-5 text-brand-600" aria-hidden /> See who&apos;s finding you</p>
              <p className="mt-1 text-sm text-slate-600">Members can see profile views, website clicks, phone taps and direction requests.</p>
              <Link href={`${root}membership/`} className="btn-primary btn-sm mt-3">See membership options</Link>
            </div>
          </div>
        )}
      </Panel>

      <Panel title="Complete your profile" description="Complete listings get noticed more. Tap any item to finish it.">
        <div className="mb-4 flex items-center gap-3">
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Profile completeness">
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-sm font-semibold tabular-nums text-navy-900">{pct}%</span>
        </div>
        <ul className="grid gap-1 sm:grid-cols-2">
          {checklist.map((c) => (
            <li key={c.label}>
              <Link href={c.href} className="flex min-h-11 items-center gap-3 rounded-lg px-2 text-sm hover:bg-slate-50">
                {c.done ? <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white"><Check className="h-4 w-4" aria-hidden /></span> : <Circle className="h-6 w-6 text-slate-300" aria-hidden />}
                <span className={c.done ? "text-slate-500 line-through" : "font-medium text-navy-900"}>{c.label}</span>
                <span className="sr-only">{c.done ? "(done)" : "(to do)"}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

import Link from "next/link";
import { CalendarClock, Clock, MapPin, MonitorPlay, UsersRound } from "lucide-react";
import { SmartImage } from "@/components/ui/smart-image";
import { formatDate, formatTime, stripHtml, truncate } from "@/lib/utils";
import { NEED_CATEGORY_LABEL, needHref, nextService, opportunityHref, orgHref, readServiceTimes } from "@/lib/gives/constants";
import { KindBadge, NeedProgress, UrgencyBadge, VerifiedBadge } from "./badges";

export type OrgCardData = {
  id: string; slug: string; name: string; kind: string; orgType?: string | null; tagline?: string | null; mission?: string | null; city?: string | null;
  logoUrl?: string | null; coverUrl?: string | null; verifiedAt?: Date | null; denomination?: string | null; serviceTimes?: unknown; livestreamUrl?: string | null;
};

function OrgLogo({ o, size = "h-14 w-14" }: { o: { name: string; logoUrl?: string | null }; size?: string }) {
  return (
    <span className={`relative ${size} shrink-0 overflow-hidden rounded-xl bg-white shadow ring-2 ring-white`}>
      {o.logoUrl ? (
        <SmartImage src={o.logoUrl} alt="" fill sizes="64px" className="object-contain p-0.5" />
      ) : (
        <span aria-hidden className="flex h-full w-full items-center justify-center bg-gradient-to-br from-navy-800 to-brand-700 font-display text-xl font-bold text-white">{o.name.charAt(0)}</span>
      )}
    </span>
  );
}

export function OrgCard({ o }: { o: OrgCardData }) {
  const blurb = o.tagline || o.mission;
  return (
    <Link href={orgHref(o)} className="card card-hover group flex h-full flex-col overflow-hidden">
      <div className="relative aspect-[16/7] overflow-hidden bg-slate-100">
        {o.coverUrl ? (
          <SmartImage src={o.coverUrl} alt="" fill sizes="(min-width:1024px) 33vw, (min-width:640px) 50vw, 100vw" className="object-cover transition duration-500 group-hover:scale-105" />
        ) : (
          <div aria-hidden className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(247,162,75,0.45),transparent_55%),linear-gradient(135deg,#10264a,#1e4277)]" />
        )}
        {o.verifiedAt && <VerifiedBadge onDark className="absolute right-3 top-3" />}
      </div>
      <div className="flex flex-1 flex-col p-4 pt-0">
        <div className="-mt-7 flex items-end gap-3">
          <OrgLogo o={o} />
          <div className="mb-0.5 min-w-0 pt-8"><KindBadge kind={o.kind} /></div>
        </div>
        <h3 className="mt-2 font-semibold text-navy-900 group-hover:text-brand-700">{o.name}</h3>
        {(o.orgType || o.denomination) && <p className="text-sm text-slate-500">{o.kind === "CHURCH" ? o.denomination || o.orgType : o.orgType}</p>}
        {blurb && <p className="mt-2 line-clamp-2 text-sm text-slate-600">{truncate(stripHtml(blurb), 150)}</p>}
        {o.city && <p className="mt-auto flex items-center gap-1 pt-3 text-sm text-slate-500"><MapPin className="h-4 w-4" aria-hidden />{o.city}</p>}
      </div>
    </Link>
  );
}

export function ChurchCard({ o }: { o: OrgCardData }) {
  const times = readServiceTimes(o.serviceTimes);
  const next = nextService(times);
  const sunday = times.filter((t) => t.day === "Sun");
  return (
    <Link href={orgHref({ ...o, kind: "CHURCH" })} className="card card-hover group flex h-full flex-col p-4">
      <div className="flex items-start gap-3">
        <OrgLogo o={o} />
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold leading-snug text-navy-900 group-hover:text-brand-700">{o.name}</h3>
          {o.denomination && <p className="text-sm text-slate-500">{o.denomination}</p>}
          <div className="mt-1 flex flex-wrap gap-1.5">
            {o.verifiedAt && <VerifiedBadge />}
            {o.livestreamUrl && <span className="badge-gray"><MonitorPlay className="h-3 w-3" aria-hidden /> Livestream</span>}
          </div>
        </div>
      </div>
      <div className="mt-3 space-y-1 text-sm">
        {sunday.length > 0 && (
          <p className="flex items-start gap-1.5 text-slate-700"><Clock className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden /><span><span className="font-medium">Sunday:</span> {sunday.map((t) => formatT(t.time)).join(", ")}</span></p>
        )}
        {next && <p className="text-slate-600"><span className="font-medium text-navy-900">Next:</span> {next.when} {next.label12}{next.label ? ` · ${next.label}` : ""}</p>}
        {!times.length && <p className="text-slate-500">Service times not listed yet</p>}
      </div>
      {o.city && <p className="mt-auto flex items-center gap-1 pt-3 text-sm text-slate-500"><MapPin className="h-4 w-4" aria-hidden />{o.city}</p>}
    </Link>
  );
}

function formatT(t: string) {
  const [h, m] = t.split(":").map(Number);
  const hh = h % 12 || 12;
  return `${hh}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h >= 12 ? "PM" : "AM"}`;
}

type OrgMini = { slug: string; name: string; kind: string; city?: string | null; logoUrl?: string | null; verifiedAt?: Date | null };

export type NeedCardData = {
  id: string; slug: string; title: string; category: string; urgency: string; quantityNeeded: number | null; quantityReceived: number; unit: string | null;
  deadline: Date | null; isWishList?: boolean; organization: OrgMini;
};

export function NeedCard({ n, pledged, showOrg = true }: { n: NeedCardData; pledged?: number; showOrg?: boolean }) {
  return (
    <Link href={needHref(n)} className="card card-hover group flex h-full flex-col p-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <UrgencyBadge urgency={n.urgency} />
        <span className="badge-gray">{NEED_CATEGORY_LABEL[n.category] ?? n.category}</span>
        {n.isWishList && <span className="badge-orange">Wish list</span>}
      </div>
      <h3 className="mt-2 font-semibold leading-snug text-navy-900 group-hover:text-brand-700">{n.title}</h3>
      {showOrg && (
        <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-600">
          <span className="truncate">{n.organization.name}</span>
          {n.organization.verifiedAt && <VerifiedBadge className="!px-1.5 !py-0" />}
        </p>
      )}
      <div className="mt-3"><NeedProgress received={n.quantityReceived} needed={n.quantityNeeded} unit={n.unit} pledged={pledged} compact /></div>
      <p className="mt-auto flex flex-wrap gap-x-3 pt-3 text-sm text-slate-500">
        {n.deadline && <span className="inline-flex items-center gap-1"><CalendarClock className="h-4 w-4" aria-hidden />By {formatDate(n.deadline, { month: "short", day: "numeric" })}</span>}
        {n.organization.city && <span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4" aria-hidden />{n.organization.city}</span>}
      </p>
    </Link>
  );
}

export type OpportunityCardData = {
  id: string; slug: string; title: string; startAt: Date | null; endAt: Date | null; isOngoing: boolean; locationName: string | null; city: string | null;
  spots: number | null; minAge: number | null; registrationOpen?: boolean; externalSignupUrl?: string | null; organization: OrgMini;
};

export function OpportunityCard({ o, left, showOrg = true }: { o: OpportunityCardData; left?: number | null; showOrg?: boolean }) {
  const when = o.isOngoing ? "Ongoing — flexible schedule" : o.startAt ? `${formatDate(o.startAt, { weekday: "short", month: "short", day: "numeric" })} · ${formatTime(o.startAt)}${o.endAt ? ` – ${formatTime(o.endAt)}` : ""}` : "Date to be announced";
  return (
    <Link href={opportunityHref(o)} className="card card-hover group flex h-full gap-3 p-4">
      {o.startAt && !o.isOngoing ? (
        <div className="flex w-14 shrink-0 flex-col self-start overflow-hidden rounded-lg border border-slate-200 bg-white text-center shadow-sm">
          <span className="bg-emerald-600 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">{formatDate(o.startAt, { month: "short" })}</span>
          <span className="py-1 text-xl font-bold leading-none text-navy-900">{formatDate(o.startAt, { day: "numeric" })}</span>
        </div>
      ) : (
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-700"><UsersRound className="h-6 w-6" aria-hidden /></span>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <h3 className="font-semibold leading-snug text-navy-900 group-hover:text-brand-700">{o.title}</h3>
        {showOrg && <p className="truncate text-sm text-slate-600">{o.organization.name}</p>}
        <p className="mt-1 text-sm text-slate-600">{when}</p>
        {(o.locationName || o.city) && <p className="flex items-center gap-1 truncate text-sm text-slate-500"><MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />{[o.locationName, o.city].filter(Boolean).join(", ")}</p>}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {left != null && (left > 0 ? <span className="badge-green">{left} spot{left === 1 ? "" : "s"} left</span> : <span className="badge-amber">Full — join the waitlist</span>)}
          {o.minAge != null && <span className="badge-gray">Ages {o.minAge}+</span>}
        </div>
      </div>
    </Link>
  );
}

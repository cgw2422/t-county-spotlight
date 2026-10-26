import Link from "next/link";
import { ExternalLink, Gift, Globe, HeartHandshake, Mail, MapPin, Megaphone, Navigation, Phone } from "lucide-react";
import { SmartImage } from "@/components/ui/smart-image";
import { EventCard } from "@/components/cards/event-card";
import { formatDate } from "@/lib/utils";
import { sanitizeRichText } from "@/lib/sanitize";
import { directionsUrl, externalUrl, safeSocials, type OrgKindValue } from "@/lib/gives/constants";
import { spotsLeft } from "@/lib/gives/queries";
import type { loadOrgActivity } from "@/lib/gives/public";
import { NeedCard, OpportunityCard } from "./cards";
import { VerifiedBadge, KindBadge } from "./badges";

type Org = {
  id: string; slug: string; name: string; kind: OrgKindValue | string; orgType: string | null; tagline: string | null; logoUrl: string | null; coverUrl: string | null;
  verifiedAt: Date | null; email: string | null; emailPublic: boolean; phone: string | null; website: string | null; socials: unknown;
  address: string | null; city: string | null; state: string | null; zip: string | null; serviceArea: string | null; donationUrl: string | null; wishlistUrl: string | null;
  denomination?: string | null; ein?: string | null;
};
type Activity = Awaited<ReturnType<typeof loadOrgActivity>>;

/** Cover + logo + name header shared by organization and church profiles. */
export function ProfileHeader({ o, crumbs, children }: { o: Org; crumbs: React.ReactNode; children?: React.ReactNode }) {
  return (
    <>
      <div className="relative h-44 bg-navy-900 sm:h-60 lg:h-72">
        {o.coverUrl ? (
          <SmartImage src={o.coverUrl} alt="" fill priority sizes="100vw" className="object-cover" />
        ) : (
          <div aria-hidden className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(247,162,75,0.5),transparent_55%),radial-gradient(ellipse_at_bottom_left,rgba(47,123,240,0.45),transparent_60%),linear-gradient(135deg,#0b1a33,#16325c_55%,#1e4277)]" />
        )}
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-navy-950/70 via-navy-950/10 to-transparent" />
      </div>
      <div className="container-page">
        <header className="relative">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
            <div className="relative -mt-14 h-28 w-28 shrink-0 overflow-hidden rounded-2xl bg-white shadow-lg ring-4 ring-white sm:-mt-16 sm:h-32 sm:w-32">
              {o.logoUrl ? (
                <SmartImage src={o.logoUrl} alt={`${o.name} logo`} fill priority sizes="128px" className="object-contain p-1" />
              ) : (
                <span aria-hidden className="flex h-full w-full items-center justify-center bg-gradient-to-br from-navy-800 to-brand-700 font-display text-5xl font-bold text-white">{o.name.charAt(0)}</span>
              )}
            </div>
            <div className="min-w-0 flex-1 sm:pt-4">
              <div className="mb-2 hidden sm:block">{crumbs}</div>
              <div className="flex flex-wrap items-center gap-2">
                <KindBadge kind={o.kind} />
                {o.verifiedAt && <VerifiedBadge />}
              </div>
              <h1 className="mt-1.5 font-display text-3xl font-bold leading-tight text-navy-900 text-balance sm:text-4xl">{o.name}</h1>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 text-slate-600">
                {(o.kind === "CHURCH" ? o.denomination || o.orgType : o.orgType) && <span>{o.kind === "CHURCH" ? o.denomination || o.orgType : o.orgType}</span>}
                {o.city && <span className="flex items-center gap-1"><MapPin className="h-4 w-4" aria-hidden />{o.city}</span>}
              </p>
              {o.tagline && <p className="mt-2 max-w-2xl text-lg text-slate-700">{o.tagline}</p>}
            </div>
          </div>
          {children && <div className="mt-6 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">{children}</div>}
        </header>
      </div>
    </>
  );
}

export function DonateCard({ o }: { o: Org }) {
  const donate = externalUrl(o.donationUrl);
  const wish = externalUrl(o.wishlistUrl);
  if (!donate && !wish) return null;
  return (
    <section aria-labelledby="give-title" className="overflow-hidden rounded-2xl bg-gradient-to-br from-sunset-500 to-sunset-600 p-5 text-white shadow-sm">
      <h2 id="give-title" className="flex items-center gap-2 font-semibold"><HeartHandshake className="h-5 w-5" aria-hidden /> Support {o.name}</h2>
      <p className="mt-1 text-sm text-white/90">Gifts go directly to {o.name} on their own website.</p>
      <div className="mt-4 grid gap-2">
        {donate && (
          <a href={donate.toString()} target="_blank" rel="noopener noreferrer" className="btn min-h-12 bg-white text-base text-navy-900 hover:bg-orange-50">
            Donate <ExternalLink className="h-4 w-4" aria-hidden /><span className="sr-only">(opens {donate.hostname.replace(/^www\./, "")} in a new tab)</span>
          </a>
        )}
        {wish && (
          <a href={wish.toString()} target="_blank" rel="noopener noreferrer" className="btn border border-white/50 text-white hover:bg-white/10">
            <Gift className="h-4 w-4" aria-hidden /> Shop our wish list <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        )}
      </div>
      {donate && <p className="mt-2 text-xs text-white/80">You&apos;ll leave TCountySpotlight for {donate.hostname.replace(/^www\./, "")}.</p>}
    </section>
  );
}

export function ContactCard({ o }: { o: Org }) {
  const site = externalUrl(o.website);
  const directions = directionsUrl(o);
  const socials = safeSocials(o.socials);
  const tel = o.phone ? o.phone.replace(/[^\d+]/g, "") : null;
  const showEmail = o.emailPublic && o.email;
  const line2 = [o.city, [o.state, o.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return (
    <section aria-labelledby="contact-title" className="card p-5">
      <h2 id="contact-title" className="font-semibold text-navy-900">Contact &amp; location</h2>
      <ul className="mt-3 space-y-3 text-sm">
        {(o.address || o.city) && (
          <li className="flex gap-3">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
            <address className="not-italic text-slate-700">
              {o.address && <>{o.address}<br /></>}{line2}
              {directions && <><br /><a href={directions} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-700 hover:underline">Get directions</a></>}
            </address>
          </li>
        )}
        {o.serviceArea && <li className="flex gap-3"><Navigation className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden /><span className="text-slate-700">Serves {o.serviceArea}</span></li>}
        {o.phone && tel && <li className="flex gap-3"><Phone className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden /><a href={`tel:${tel}`} className="text-slate-700 hover:text-brand-700">{o.phone}</a></li>}
        {site && <li className="flex min-w-0 gap-3"><Globe className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden /><a href={site.toString()} target="_blank" rel="noopener" className="truncate text-brand-700 hover:underline">{site.hostname.replace(/^www\./, "")}</a></li>}
        {showEmail && <li className="flex min-w-0 gap-3"><Mail className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden /><a href={`mailto:${o.email}`} className="truncate text-brand-700 hover:underline">{o.email}</a></li>}
      </ul>
      {!o.address && !o.city && !o.phone && !site && !showEmail && <p className="mt-2 text-sm text-slate-500">Contact details haven&rsquo;t been added yet.</p>}
      {socials.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
          {socials.map((s) => (
            <li key={s.key}><a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center rounded-full bg-slate-100 px-3 text-sm font-medium text-slate-700 hover:bg-slate-200">{s.label}</a></li>
          ))}
        </ul>
      )}
      {o.verifiedAt && o.ein && <p className="mt-4 border-t border-slate-100 pt-4 text-xs text-slate-500">Verified organization · EIN {o.ein}</p>}
    </section>
  );
}

/** Needs, wish list, volunteer opportunities, events and updates. */
export function ActivitySections({ o, a, headings }: { o: Org; a: Activity; headings?: { needs?: string; volunteer?: string } }) {
  return (
    <>
      {a.needs.length > 0 && (
        <section aria-labelledby="needs-title">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 id="needs-title" className="section-title">{headings?.needs ?? "Current needs"}</h2>
            <Link href={`/gives/needs/`} className="text-sm font-semibold text-brand-700 hover:underline">All community needs →</Link>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">{a.needs.map((n) => <NeedCard key={n.id} n={n} pledged={a.pledged.get(n.id)} showOrg={false} />)}</div>
        </section>
      )}
      {(a.wishList.length > 0 || o.wishlistUrl) && (
        <section aria-labelledby="wish-title">
          <h2 id="wish-title" className="section-title">Wish list</h2>
          <p className="mt-1 text-slate-600">Items {o.name} always welcomes.</p>
          {a.wishList.length > 0 && <div className="mt-4 grid gap-4 sm:grid-cols-2">{a.wishList.map((n) => <NeedCard key={n.id} n={n} pledged={a.pledged.get(n.id)} showOrg={false} />)}</div>}
          {externalUrl(o.wishlistUrl) && (
            <a href={externalUrl(o.wishlistUrl)!.toString()} target="_blank" rel="noopener noreferrer" className="btn-secondary mt-4"><Gift className="h-4 w-4" aria-hidden /> Shop the online wish list <ExternalLink className="h-3.5 w-3.5" aria-hidden /></a>
          )}
        </section>
      )}
      {a.opps.length > 0 && (
        <section aria-labelledby="vol-title">
          <h2 id="vol-title" className="section-title">{headings?.volunteer ?? "Volunteer opportunities"}</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {a.opps.map((v) => <OpportunityCard key={v.id} o={v} left={spotsLeft(v.spots, a.signups.get(v.id) ?? 0)} showOrg={false} />)}
          </div>
        </section>
      )}
      {a.events.length > 0 && (
        <section aria-labelledby="events-title">
          <h2 id="events-title" className="section-title">Upcoming events</h2>
          <div className="mt-4 grid grid-cols-1 gap-3">{a.events.map((e) => <EventCard key={e.id} e={e} layout="row" />)}</div>
        </section>
      )}
      {a.updates.length > 0 && (
        <section aria-labelledby="updates-title">
          <h2 id="updates-title" className="section-title">News &amp; updates</h2>
          <ul className="mt-4 space-y-4">
            {a.updates.map((u) => (
              <li key={u.id} className="card overflow-hidden sm:flex">
                {u.imageUrl && (
                  <div className="relative aspect-[16/9] shrink-0 bg-slate-100 sm:aspect-auto sm:w-48">
                    <SmartImage src={u.imageUrl} alt="" fill sizes="(min-width:640px) 192px, 100vw" className="object-cover" />
                  </div>
                )}
                <div className="p-5">
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-700"><Megaphone className="h-3.5 w-3.5" aria-hidden /> <time dateTime={u.createdAt.toISOString()}>{formatDate(u.createdAt)}</time></p>
                  <h3 className="mt-1 font-semibold text-navy-900">{u.title}</h3>
                  <div className="mt-1 space-y-2 text-sm text-slate-700" dangerouslySetInnerHTML={{ __html: sanitizeRichText(u.body) }} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, CheckCircle2, ClipboardList, MapPin, Navigation } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { sanitizeRichText } from "@/lib/sanitize";
import { PROSE_CLASSES } from "@/lib/prose";
import { absoluteUrl, formatDate, stripHtml } from "@/lib/utils";
import { NEED_CATEGORY_LABEL, NEED_STATUS_LABEL, mapsUrl, needHref, orgHref } from "@/lib/gives/constants";
import { openNeedWhere, pledgedTotals, publicOrgWhere } from "@/lib/gives/queries";
import { NeedProgress, UrgencyBadge, VerifiedBadge, KindBadge } from "@/components/gives/badges";
import { PledgeForm } from "@/components/gives/public-forms";
import { Breadcrumbs } from "@/components/public/breadcrumbs";
import { ShareButtons } from "@/components/public/share-buttons";
import { buildMetadata } from "@/components/public/seo";
import { SmartImage } from "@/components/ui/smart-image";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }> };

async function load(slug: string) {
  let s = slug;
  try { s = decodeURIComponent(slug); } catch {}
  return db.communityNeed.findFirst({
    where: { slug: s.toLowerCase(), deletedAt: null, status: { not: "DRAFT" }, organization: publicOrgWhere() },
    include: { organization: { select: { id: true, slug: true, name: true, kind: true, city: true, logoUrl: true, verifiedAt: true, email: true, emailPublic: true, phone: true, tagline: true } } },
  });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const n = await load((await params).slug);
  if (!n) return {};
  return buildMetadata({
    title: `${n.title} — ${n.organization.name}`,
    description: stripHtml(n.description) || `${n.organization.name} needs help: ${n.title}. Pledge to help on T-County Gives.`,
    path: needHref(n),
    image: n.organization.logoUrl,
    noindex: !["OPEN", "PARTIALLY_FULFILLED"].includes(n.status),
  });
}

export default async function NeedPage({ params }: Props) {
  const { slug } = await params;
  const n = await load(slug);
  if (!n) notFound();
  const [open, pledged, user] = await Promise.all([
    db.communityNeed.count({ where: openNeedWhere({ id: n.id }) }),
    pledgedTotals([n.id]),
    getCurrentUser(),
  ]);
  const o = n.organization;
  const description = sanitizeRichText(n.description);
  const url = absoluteUrl(needHref(n));
  const remaining = n.quantityNeeded ? Math.max(1, n.quantityNeeded - n.quantityReceived) : 1;
  const done = n.status === "FULFILLED";

  return (
    <article className="container-page py-6 sm:py-10">
      <Breadcrumbs items={[{ label: "T-County Gives", href: "/gives/" }, { label: "Needs", href: "/gives/needs/" }, { label: n.title }]} className="mb-5" />
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-8">
          <header>
            <div className="flex flex-wrap items-center gap-2">
              <UrgencyBadge urgency={n.urgency} />
              <span className="badge-gray">{NEED_CATEGORY_LABEL[n.category]}</span>
              {n.isWishList && <span className="badge-orange">Wish list</span>}
              {n.status !== "OPEN" && <span className={done ? "badge-green" : "badge-blue"}>{NEED_STATUS_LABEL[n.status]}</span>}
            </div>
            <h1 className="mt-2 font-display text-3xl font-bold leading-tight text-navy-900 text-balance sm:text-4xl">{n.title}</h1>
            <Link href={orgHref(o)} className="mt-4 flex items-center gap-3 rounded-2xl bg-white p-3 ring-1 ring-slate-200 hover:ring-brand-300">
              <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-navy-800">
                {o.logoUrl ? <SmartImage src={o.logoUrl} alt="" fill sizes="48px" className="bg-white object-contain" /> : <span className="flex h-full w-full items-center justify-center font-display text-lg font-bold text-white">{o.name[0]}</span>}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-1.5 font-semibold text-navy-900">{o.name} {o.verifiedAt && <VerifiedBadge />}</span>
                <span className="flex flex-wrap items-center gap-1.5 text-sm text-slate-500"><KindBadge kind={o.kind} />{o.city}</span>
              </span>
            </Link>
          </header>

          <section className="card p-5 sm:p-6" aria-label="Progress">
            <NeedProgress received={n.quantityReceived} needed={n.quantityNeeded} unit={n.unit} pledged={pledged.get(n.id)} />
            {!n.quantityNeeded && !pledged.get(n.id) && <p className="text-sm text-slate-600">Be the first to pledge.</p>}
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              {n.quantityNeeded && <div><dt className="text-slate-500">Quantity needed</dt><dd className="font-semibold text-navy-900">{n.quantityNeeded.toLocaleString()}{n.unit ? ` ${n.unit}` : ""}</dd></div>}
              {n.deadline && <div><dt className="text-slate-500">Needed by</dt><dd className="flex items-center gap-1 font-semibold text-navy-900"><CalendarClock className="h-4 w-4" aria-hidden />{formatDate(n.deadline, { weekday: "long", month: "long", day: "numeric" })}</dd></div>}
            </dl>
            <p className="mt-3 text-xs text-slate-500">&ldquo;Received&rdquo; counts only donations the organization has confirmed.</p>
          </section>

          {description && (
            <section aria-labelledby="about-need">
              <h2 id="about-need" className="section-title">About this need</h2>
              <div className={`${PROSE_CLASSES} mt-3 text-slate-800`} dangerouslySetInnerHTML={{ __html: description }} />
            </section>
          )}

          {(n.instructions || n.dropoffLocation) && (
            <section aria-labelledby="how-title" className="rounded-2xl bg-cream p-5 ring-1 ring-amber-200/60 sm:p-6">
              <h2 id="how-title" className="flex items-center gap-2 font-display text-xl font-semibold text-navy-900"><ClipboardList className="h-5 w-5 text-sunset-600" aria-hidden /> How to give</h2>
              {n.instructions && <p className="mt-2 whitespace-pre-line text-slate-800">{n.instructions}</p>}
              {n.dropoffLocation && (
                <p className="mt-3 flex items-start gap-2 text-slate-800">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                  <span>{n.dropoffLocation} · <a href={mapsUrl(`${n.dropoffLocation}${o.city ? `, ${o.city}, OH` : ""}`)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline"><Navigation className="h-3.5 w-3.5" aria-hidden />Map</a></span>
                </p>
              )}
            </section>
          )}
          <ShareButtons url={url} title={`${o.name} needs: ${n.title}`} />
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start" aria-labelledby="pledge-title">
          <div className="card p-5 sm:p-6">
            {open ? (
              <>
                <h2 id="pledge-title" className="font-display text-2xl font-semibold text-navy-900">I can help</h2>
                <p className="mt-1 mb-5 text-sm text-slate-600">Pledge what you can give. We&apos;ll email you how and where to drop it off.</p>
                <PledgeForm needId={n.id} unit={n.unit} prefill={{ name: user?.name, email: user?.email }} suggested={n.quantityNeeded ? Math.min(remaining, 1) : 1} />
              </>
            ) : (
              <div className="text-center">
                <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" aria-hidden />
                <h2 id="pledge-title" className="mt-2 font-display text-xl font-semibold text-navy-900">{done ? "This need has been met — thank you!" : "This need is no longer accepting pledges"}</h2>
                <p className="mt-2 text-sm text-slate-600">See what else {o.name} and other organizations need.</p>
                <div className="mt-4 grid gap-2">
                  <Link href={orgHref(o)} className="btn-primary">Visit {o.name}</Link>
                  <Link href="/gives/needs/" className="btn-secondary">All community needs</Link>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </article>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, MapPin, Store } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { promotionStatus } from "@/lib/promotions";
import { sanitizeRichText } from "@/lib/sanitize";
import { PROSE_CLASSES } from "@/lib/prose";
import { businessHref, specialHref } from "@/lib/links";
import { absoluteUrl, formatDate, stripHtml } from "@/lib/utils";
import { SmartImage } from "@/components/ui/smart-image";
import { ImagePlaceholder } from "@/components/ui/placeholder";
import { Breadcrumbs } from "@/components/public/breadcrumbs";
import { JsonLd } from "@/components/public/json-ld";
import { SaveButton } from "@/components/public/save-button";
import { ShareButtons } from "@/components/public/share-buttons";
import { CouponReveal } from "@/components/public/coupon-reveal";
import { TrackView } from "@/components/public/track";
import { buildMetadata } from "@/components/public/seo";
import { followRedirectIfAny, isSaved } from "@/components/public/server";
import { RedeemForm } from "./redeem-form";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

async function load(slug: string) {
  let s = slug;
  try { s = decodeURIComponent(slug); } catch {}
  const p = await db.promotion.findFirst({
    where: { slug: s.toLowerCase(), deletedAt: null, status: "APPROVED" },
    include: {
      business: {
        select: { id: true, slug: true, name: true, logoUrl: true, coverUrl: true, city: true, address: true, phone: true, status: true, deletedAt: true, categories: { select: { name: true }, take: 2 } },
      },
    },
  });
  if (!p || p.business.status !== "PUBLISHED" || p.business.deletedAt) return null;
  return p;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await load((await params).slug);
  if (!p) return {};
  const status = promotionStatus(p);
  return buildMetadata({
    title: `${p.title} at ${p.business.name}`,
    description: stripHtml(p.description) || `${p.title} — a special offer from ${p.business.name}${p.business.city ? ` in ${p.business.city}` : ""}.`,
    path: specialHref(p),
    image: p.imageUrl || p.business.coverUrl,
    noindex: status !== "Active",
  });
}

export default async function SpecialPage({ params }: Props) {
  const { slug } = await params;
  const p = await load(slug);
  if (!p) {
    await followRedirectIfAny(`/specials/${slug}/`);
    notFound();
  }
  const status = promotionStatus(p);
  const active = status === "Active";
  const user = await getCurrentUser();
  const [settings, saved, mine, used] = await Promise.all([
    getSettings(),
    isSaved("PROMOTION", p.id),
    user ? db.promotionRedemption.findUnique({ where: { promotionId_userId: { promotionId: p.id, userId: user.id } } }) : null,
    p.redemptionLimit != null ? db.promotionRedemption.count({ where: { promotionId: p.id } }) : Promise.resolve(0),
  ]);
  const left = p.redemptionLimit != null ? Math.max(0, p.redemptionLimit - used) : null;
  const img = p.imageUrl || p.business.coverUrl;
  const url = absoluteUrl(specialHref(p));
  const path = specialHref(p);

  return (
    <article className="pb-8">
      {active && <TrackView type="view_promotion" businessId={p.business.id} targetType="PROMOTION" targetId={p.id} />}
      <div className="container-page pt-6 sm:pt-8">
        <Breadcrumbs items={[{ label: "Specials", href: "/specials/" }, { label: p.title }]} />
      </div>
      <div className="container-page mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_380px] lg:gap-10">
        <div className="min-w-0">
          <div className="relative aspect-[16/10] overflow-hidden rounded-2xl bg-slate-100">
            {img ? <SmartImage src={img} alt="" fill priority sizes="(min-width:1024px) 760px, 100vw" className={`object-cover ${active ? "" : "grayscale"}`} /> : <ImagePlaceholder label={p.business.name} />}
            <div className="absolute left-3 top-3 flex gap-1.5">
              {p.isSponsored && <span className="badge-sponsored">{settings.sponsoredLabel}</span>}
              {p.isFeatured && !p.isSponsored && <span className="badge bg-sunset-500 text-white">Featured</span>}
            </div>
          </div>
          <p className="mt-6 eyebrow">Special offer</p>
          <h1 className="mt-1 font-display text-3xl font-bold leading-tight text-navy-900 text-balance sm:text-4xl">{p.title}</h1>
          <p className="mt-2 text-lg text-slate-600">from <Link href={businessHref(p.business)} className="font-semibold text-brand-700 hover:underline">{p.business.name}</Link></p>

          {status === "Expired" && <p role="status" className="mt-6 rounded-xl bg-slate-100 px-4 py-3 font-semibold text-slate-700">This offer has expired.</p>}
          {status === "Scheduled" && <p role="status" className="mt-6 rounded-xl bg-brand-50 px-4 py-3 font-semibold text-brand-700">This offer starts {formatDate(p.startsAt)}.</p>}

          {p.description && (/<[a-z][\s\S]*>/i.test(p.description)
            ? <div className={`${PROSE_CLASSES} mt-6 max-w-[70ch] text-slate-800`} dangerouslySetInnerHTML={{ __html: sanitizeRichText(p.description) }} />
            : <p className="mt-6 max-w-[70ch] whitespace-pre-line text-lg leading-relaxed text-slate-800">{p.description}</p>)}

          {p.terms && (
            <section aria-labelledby="terms" className="mt-8 max-w-[70ch] rounded-xl bg-slate-50 p-5 ring-1 ring-slate-200">
              <h2 id="terms" className="text-sm font-semibold uppercase tracking-wider text-slate-500">Terms &amp; conditions</h2>
              <p className="mt-2 whitespace-pre-line text-sm text-slate-700">{stripHtml(p.terms)}</p>
            </section>
          )}
          <ShareButtons url={url} title={`${p.title} at ${p.business.name}`} className="mt-8 border-t border-slate-200 pt-6" />
        </div>

        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start" aria-label="Redeem this offer">
          <div className="card p-5">
            <dl className="space-y-3 text-sm">
              <div className="flex gap-3">
                <dt><CalendarClock className="h-5 w-5 text-slate-400" aria-hidden /><span className="sr-only">Valid</span></dt>
                <dd className="text-slate-700">
                  {p.endsAt ? <>Valid {formatDate(p.startsAt, { month: "short", day: "numeric" })} – {formatDate(p.endsAt, { month: "short", day: "numeric", year: "numeric" })}</> : <>Ongoing offer since {formatDate(p.startsAt, { month: "short", day: "numeric", year: "numeric" })}</>}
                </dd>
              </div>
              {left != null && active && (
                <div className="flex gap-3">
                  <dt className="sr-only">Availability</dt>
                  <dd className={left > 0 ? "font-semibold text-emerald-700" : "font-semibold text-red-700"}>{left > 0 ? `${left} of ${p.redemptionLimit} left` : "Fully claimed"}</dd>
                </div>
              )}
            </dl>

            {active && (
              <div className="mt-5 space-y-3 border-t border-slate-100 pt-5">
                {p.couponCode && <CouponReveal code={p.couponCode} />}
                {user ? (
                  left === 0 && !mine ? null : <RedeemForm promotionId={p.id} alreadyRedeemedAt={mine ? formatDate(mine.createdAt) : null} />
                ) : (
                  <Link href={`/login/?next=${encodeURIComponent(path)}`} className="btn-primary w-full">Sign in to redeem</Link>
                )}
              </div>
            )}
            <div className="mt-3"><SaveButton type="PROMOTION" targetId={p.id} initial={saved} className="w-full" /></div>
          </div>

          <Link href={businessHref(p.business)} className="card card-hover group flex items-center gap-4 p-4">
            <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-slate-100">
              {p.business.logoUrl ? <SmartImage src={p.business.logoUrl} alt="" fill sizes="56px" className="object-cover" /> : <span className="flex h-full w-full items-center justify-center bg-navy-800 text-white"><Store className="h-6 w-6" aria-hidden /></span>}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-navy-900 group-hover:text-brand-700">{p.business.name}</p>
              {p.business.categories[0] && <p className="text-sm text-slate-500">{p.business.categories.map((c) => c.name).join(" · ")}</p>}
              {p.business.city && <p className="flex items-center gap-1 text-sm text-slate-500"><MapPin className="h-3.5 w-3.5" aria-hidden />{p.business.city}</p>}
            </div>
          </Link>
        </aside>
      </div>

      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Offer",
          name: p.title,
          description: stripHtml(p.description) || undefined,
          url,
          image: img ? absoluteUrl(img) : undefined,
          validFrom: p.startsAt.toISOString(),
          validThrough: p.endsAt?.toISOString(),
          availability: active ? "https://schema.org/InStock" : "https://schema.org/Discontinued",
          offeredBy: { "@type": "LocalBusiness", name: p.business.name, url: absoluteUrl(businessHref(p.business)) },
        }}
      />
    </article>
  );
}

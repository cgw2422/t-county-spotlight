import type { Metadata } from "next";
import Link from "next/link";
import { Tag } from "lucide-react";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { activePromotionWhere } from "@/lib/promotions";
import { cn } from "@/lib/utils";
import { SpecialCard } from "@/components/cards/special-card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/public/page-header";
import { Pagination } from "@/components/public/pagination";
import { buildMetadata, pageParam, param, qs, type SearchParams } from "@/components/public/seo";

export const dynamic = "force-dynamic";
const PER_PAGE = 24;

const specialSelect = {
  id: true, slug: true, title: true, imageUrl: true, endsAt: true, isFeatured: true, isSponsored: true,
  business: { select: { name: true, logoUrl: true, coverUrl: true } },
} as const;

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const sp = await searchParams;
  const catSlug = param(sp, "category");
  const cat = catSlug ? await db.businessCategory.findUnique({ where: { slug: catSlug }, select: { name: true } }) : null;
  const page = pageParam(sp);
  return buildMetadata({
    title: cat ? `${cat.name} Specials & Deals` : "Local Specials & Deals",
    description: "Current deals, coupons and special offers from Tuscarawas County businesses.",
    path: `/specials/${qs({ category: cat ? catSlug : undefined, page: page > 1 ? page : undefined })}`,
  });
}

export default async function SpecialsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const catSlug = param(sp, "category");
  const page = pageParam(sp);
  const now = new Date();
  const active = activePromotionWhere(now);

  const [settings, categories] = await Promise.all([
    getSettings(),
    db.businessCategory.findMany({
      where: { businesses: { some: { promotions: { some: active } } } },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, slug: true },
    }),
  ]);
  const category = categories.find((c) => c.slug === catSlug) ?? null;
  const where = category ? { ...active, business: { ...(active.business as object), categories: { some: { id: category.id } } } } : active;
  const [total, items] = await Promise.all([
    db.promotion.count({ where }),
    db.promotion.findMany({ where, select: specialSelect, orderBy: [{ isSponsored: "desc" }, { isFeatured: "desc" }, { startsAt: "desc" }], skip: (page - 1) * PER_PAGE, take: PER_PAGE }),
  ]);
  const href = (o: { category?: string | null; page?: number }) => `/specials/${qs({ category: o.category === undefined ? category?.slug : o.category, page: o.page && o.page > 1 ? o.page : undefined })}`;
  const sponsored = items.filter((p) => p.isSponsored);
  const regular = items.filter((p) => !p.isSponsored);

  return (
    <>
      <PageHeader
        eyebrow="Save local"
        title={category ? `${category.name} specials` : "Local Specials"}
        subtitle="Deals, coupons and limited-time offers from businesses around Tuscarawas County."
        crumbs={category ? [{ label: "Specials", href: "/specials/" }, { label: category.name }] : [{ label: "Specials" }]}
      />
      <div className="container-page py-6 sm:py-8">
        {categories.length > 0 && (
          <nav aria-label="Special categories" className="-mx-4 mb-6 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:px-0">
            <ul className="flex gap-2 pb-1 sm:flex-wrap">
              <li><Link href={href({ category: null, page: 1 })} aria-current={!category ? "page" : undefined} className={cn("inline-flex min-h-10 items-center whitespace-nowrap rounded-full px-4 text-sm font-medium ring-1", !category ? "bg-navy-800 text-white ring-navy-800" : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50")}>All specials</Link></li>
              {categories.map((c) => (
                <li key={c.id}><Link href={href({ category: c.slug, page: 1 })} aria-current={c.id === category?.id ? "page" : undefined} className={cn("inline-flex min-h-10 items-center whitespace-nowrap rounded-full px-4 text-sm font-medium ring-1", c.id === category?.id ? "bg-navy-800 text-white ring-navy-800" : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50")}>{c.name}</Link></li>
              ))}
            </ul>
          </nav>
        )}

        {items.length === 0 ? (
          <EmptyState icon={Tag} title={category ? `No ${category.name.toLowerCase()} specials right now` : "No specials running right now"}>
            Check back soon — local businesses post new offers regularly. Own a business? <Link href="/list-your-business/" className="font-semibold text-brand-700">Get listed</Link> to share your specials.
          </EmptyState>
        ) : (
          <>
            {sponsored.length > 0 && (
              <section aria-labelledby="sp-sponsored" className="mb-10 rounded-2xl bg-amber-50/60 p-4 ring-1 ring-amber-200 sm:p-5">
                <h2 id="sp-sponsored" className="mb-4 flex items-center gap-2 text-sm font-semibold text-amber-900"><span className="badge-sponsored">{settings.sponsoredLabel}</span> Featured offers</h2>
                <div className="grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">{sponsored.map((p) => <SpecialCard key={p.id} p={p} />)}</div>
              </section>
            )}
            {regular.length > 0 && (
              <section aria-label="All specials">
                <p className="mb-4 text-sm text-slate-600"><span className="font-semibold text-slate-900">{total}</span> active {total === 1 ? "offer" : "offers"}</p>
                <div className="grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">{regular.map((p) => <SpecialCard key={p.id} p={p} />)}</div>
              </section>
            )}
          </>
        )}
        <Pagination page={page} totalPages={Math.max(1, Math.ceil(total / PER_PAGE))} hrefFor={(p) => href({ page: p })} />
      </div>
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/public/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { TrackView } from "@/components/public/track";
import { buildMetadata, param, qs, type SearchParams } from "@/components/public/seo";
import { COMMUNITIES, communityName } from "@/lib/my-t-county-shared";
import { getOpenings, OPENING_ARCHIVE_DAYS, OPENING_KINDS, OPENING_LABELS, OPENING_SLUGS, openingKindFromSlug } from "@/lib/openings";
import { OpeningCard } from "@/components/openings/opening-card";

export const dynamic = "force-dynamic";

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const sp = await searchParams;
  const filtered = ["status", "city"].some((k) => param(sp, k));
  return buildMetadata({
    title: "New & Coming Soon in Tuscarawas County",
    description: "Businesses coming soon, recently opened, relocating or expanding across Tuscarawas County, Ohio.",
    path: "/new/",
    noindex: filtered,
  });
}

export default async function NewAndComingSoonPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const kind = openingKindFromSlug(param(sp, "status"));
  const city = communityName(param(sp, "city"));
  const { current, earlier } = await getOpenings({ kind, city });
  const status = kind ? OPENING_SLUGS[kind] : "";
  const tabs = [{ slug: "", label: "All" }, ...OPENING_KINDS.map((k) => ({ slug: OPENING_SLUGS[k], label: OPENING_LABELS[k] }))];
  const filtered = !!kind || !!city;

  return (
    <>
      <TrackView type="view_openings" />
      <PageHeader
        eyebrow="Local discovery"
        title="New & Coming Soon in Tuscarawas County"
        subtitle="Businesses opening, recently opened, moving or growing across T County. Dates are shown only when they've been announced."
        crumbs={[{ label: "New & Coming Soon" }]}
      >
        <Link href="/submit/suggest/?kind=BUSINESS_OPENING" className="btn-secondary"><Plus className="h-4 w-4" aria-hidden /> Tell us about an opening</Link>
      </PageHeader>
      <div className="container-page py-8">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <nav aria-label="Status" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
            {tabs.map((t) => (
              <Link key={t.slug || "all"} href={`/new/${qs({ status: t.slug, city: city ? param(sp, "city") : "" })}`} aria-current={t.slug === status ? "page" : undefined}
                className={cn("inline-flex min-h-11 shrink-0 items-center rounded-full px-4 text-sm font-semibold ring-1", t.slug === status ? "bg-navy-900 text-white ring-navy-900" : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50")}>
                {t.label}
              </Link>
            ))}
          </nav>
          <form action="/new/" method="get" className="flex items-end gap-2">
            {status && <input type="hidden" name="status" value={status} />}
            <div className="min-w-0 flex-1 lg:w-60 lg:flex-none">
              <label htmlFor="f-city" className="label">Community</label>
              <select id="f-city" name="city" defaultValue={city ?? ""} className="input">
                <option value="">All communities</option>
                {COMMUNITIES.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
              </select>
            </div>
            <button className="btn-primary">Apply</button>
          </form>
        </div>

        <section aria-labelledby="current-title">
          <h2 id="current-title" className="mb-4 text-sm text-slate-600">
            <span className="font-semibold text-slate-900">{current.length}</span> {current.length === 1 ? "listing" : "listings"}{kind ? ` · ${OPENING_LABELS[kind]}` : ""}{city ? ` · ${city}` : ""}
          </h2>
          {current.length ? (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{current.map((o) => <OpeningCard key={o.id} o={o} />)}</div>
          ) : (
            <EmptyState icon={Sparkles} title={filtered ? "Nothing matches these filters right now" : "No new or coming soon businesses listed yet"}>
              {filtered && <><Link href="/new/" className="font-semibold text-brand-700">See everything</Link> or </>}
              Know about a business opening nearby? <Link href="/submit/suggest/?kind=BUSINESS_OPENING" className="font-semibold text-brand-700">Tell us about it</Link>.
            </EmptyState>
          )}
        </section>

        {earlier.length > 0 && (
          <section aria-labelledby="earlier-title" className="mt-12" data-testid="openings-earlier">
            <h2 id="earlier-title" className="section-title">Earlier</h2>
            <p className="mt-1 text-sm text-slate-600">Openings and moves from more than {OPENING_ARCHIVE_DAYS} days ago, kept for reference.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{earlier.map((o) => <OpeningCard key={o.id} o={o} compact />)}</div>
          </section>
        )}
      </div>
    </>
  );
}

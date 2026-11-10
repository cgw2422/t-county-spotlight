import { SectionHeader } from "@/components/home/section-header";
import { getHomepageOpenings } from "@/lib/openings";
import { OpeningCard } from "./opening-card";

/**
 * Homepage "New & Coming Soon": published openings still within their homepage
 * window (featuredUntil null or future, not aged into the archive), the
 * visitor's community first. Hidden when empty.
 */
export async function OpeningsHomeSection({ title, subtitle, limit, community }: { title: string; subtitle?: string | null; limit: number; community: string | null }) {
  const items = await getHomepageOpenings([community], limit || 4);
  if (!items.length) return null;
  return (
    <section className="container-page py-12" data-testid="home-openings">
      <SectionHeader title={title} subtitle={subtitle} href="/new/" />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{items.map((o) => <OpeningCard key={o.id} o={o} />)}</div>
    </section>
  );
}

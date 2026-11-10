import Link from "next/link";
import { getRequestTheme } from "@/lib/seasonal-theme";
import { getSeasonalPicks } from "@/lib/seasonal-picks";
import { SEASON_LABEL } from "@/lib/seasons";
import { EventCard } from "@/components/cards/event-card";
import { ArticleCard } from "@/components/cards/article-card";
import { CollectionCard } from "@/components/explore/collection-cards";
import { SeasonIcon } from "./season-icon";
import { SectionHeader } from "./section-header";

/**
 * Homepage section "Around T County This Season" (HomepageSection type
 * `seasonal`). Shown only while a seasonal theme is active and only with real,
 * currently public picks — otherwise it renders nothing.
 */
export async function SeasonalSection({ title, subtitle }: { title: string; subtitle?: string | null }) {
  const theme = await getRequestTheme();
  if (!theme) return null;
  const picks = await getSeasonalPicks(theme.season, theme.settings.picks);
  if (picks.isEmpty) return null;
  const { season } = theme;
  const heading = title || `Around T County This ${SEASON_LABEL[season]}`;
  return (
    <section className="bg-[var(--season-tint)] border-y border-[var(--season-border)] py-12" data-testid="home-seasonal" aria-label={heading}>
      <div className="container-page">
        <p className="eyebrow-season mb-2 flex items-center gap-1.5">
          {theme.showAccents && <SeasonIcon season={season} />}
          {theme.settings.eyebrow}
        </p>
        <SectionHeader title={heading} subtitle={subtitle} />
        {picks.events.length > 0 && (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4" data-testid="seasonal-events">{picks.events.map((e) => <EventCard key={e.id} e={e} />)}</div>
        )}
        {picks.collections.length > 0 && (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3" data-testid="seasonal-collections">{picks.collections.map((c) => <CollectionCard key={c.id} c={c} />)}</div>
        )}
        {picks.articles.length > 0 && (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3" data-testid="seasonal-articles">{picks.articles.map((a) => <ArticleCard key={a.id} a={a} />)}</div>
        )}
        {picks.links.length > 0 && (
          <ul className="mt-8 flex flex-wrap gap-2" aria-label={`More for ${SEASON_LABEL[season].toLowerCase()}`}>
            {picks.links.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="inline-flex min-h-11 items-center rounded-full border border-[var(--season-border)] bg-white px-4 text-sm font-semibold text-[var(--season-accent)] hover:underline">{l.label}</Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

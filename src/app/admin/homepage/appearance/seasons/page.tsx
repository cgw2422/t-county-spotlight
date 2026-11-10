import Link from "next/link";
import { ExternalLink, Image as ImageIcon } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import { getSeasonalState, seasonPreviewUrl, type PreviewTarget } from "@/lib/seasonal-theme";
import { activeSeason, formatMonthDay, SEASON_LABEL, SEASONS, type Season } from "@/lib/seasons";
import type { LookupItem } from "@/app/admin/_actions/common";
import { PageHeader } from "@/components/admin/page-header";
import { SeasonsEditor, type PickLabels } from "./seasons-editor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Seasonal themes", robots: { index: false, follow: false } };

async function labels(ids: { collectionIds: string[]; articleIds: string[]; eventIds: string[] }): Promise<{ collections: LookupItem[]; articles: LookupItem[]; events: LookupItem[] }> {
  const [c, a, e] = await Promise.all([
    ids.collectionIds.length ? db.exploreCollection.findMany({ where: { id: { in: ids.collectionIds } }, select: { id: true, title: true, status: true } }) : [],
    ids.articleIds.length ? db.article.findMany({ where: { id: { in: ids.articleIds } }, select: { id: true, title: true, status: true, deletedAt: true } }) : [],
    ids.eventIds.length ? db.event.findMany({ where: { id: { in: ids.eventIds } }, select: { id: true, title: true, status: true, startAt: true } }) : [],
  ]);
  const order = <T extends { id: string }>(list: T[], idl: string[]) => idl.map((id) => list.find((x) => x.id === id)).filter((x): x is T => !!x);
  return {
    collections: order(c, ids.collectionIds).map((r) => ({ id: r.id, label: r.title, sub: r.status === "PUBLISHED" ? "published" : `${r.status.toLowerCase()} — hidden until published` })),
    articles: order(a, ids.articleIds).map((r) => ({ id: r.id, label: r.title, sub: r.deletedAt ? "deleted — hidden" : r.status === "PUBLISHED" ? "published" : `${r.status.toLowerCase()} — hidden until published` })),
    events: order(e, ids.eventIds).map((r) => ({ id: r.id, label: r.title, sub: `${r.startAt.toLocaleDateString("en-US", { timeZone: "America/New_York" })} · ${r.status.toLowerCase()}` })),
  };
}

export default async function SeasonalThemesPage() {
  const user = await requireStaff();
  const canEdit = user.role === "ADMIN";
  const state = await getSeasonalState();
  const ids = [state.draftUpdatedById, state.publishedById].filter((x): x is string => !!x);
  const users = ids.length ? await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true } }) : [];
  const who = (id: string | null) => {
    const u = users.find((x) => x.id === id);
    return u ? u.name || u.email : null;
  };
  const targets: PreviewTarget[] = [...SEASONS, "auto"];
  const previewUrls = Object.fromEntries(await Promise.all(targets.map(async (t) => [t, await seasonPreviewUrl(t)] as const))) as Record<PreviewTarget, string>;
  const pickLabels = Object.fromEntries(await Promise.all(SEASONS.map(async (s) => [s, await labels(state.draft.seasons[s].picks)] as const))) as PickLabels;
  const liveSeason = activeSeason(state.published);
  const draftSeason = activeSeason(state.draft);
  const p = state.published;
  const status = {
    live: p?.enabled && liveSeason
      ? `${SEASON_LABEL[liveSeason]} theme · ${p.mode === "manual" ? "chosen manually" : "automatic by date"}`
      : "Normal brand theme (seasonal themes off)",
    publishedAt: state.publishedAt ? `${formatDateTime(state.publishedAt)}${who(state.publishedById) ? ` by ${who(state.publishedById)}` : ""}` : null,
    draftAt: state.draftUpdatedAt ? `${formatDateTime(state.draftUpdatedAt)}${who(state.draftUpdatedById) ? ` by ${who(state.draftUpdatedById)}` : ""}` : null,
    draftSummary: state.draft.enabled && draftSeason ? `${SEASON_LABEL[draftSeason]} would show today` : "Seasonal themes off in the draft",
    hasUnpublishedChanges: state.hasUnpublishedChanges,
  };
  const startsLine = SEASONS.map((s) => `${SEASON_LABEL[s]} ${formatMonthDay(state.draft.starts[s])}`).join(" · ");

  return (
    <>
      <PageHeader
        back={{ href: "/admin/homepage/appearance/", label: "Homepage appearance" }}
        title="Seasonal themes"
        description={<>Subtle seasonal touches — hero photo, accent color, section tints and a short heading — built from the T County Connect palette. Logos, navigation, layouts, business profiles, accounts and the footer never change. Season dates: {startsLine} (Eastern time).</>}
        actions={<>
          <Link href="/admin/homepage/appearance/" className="btn-secondary"><ImageIcon className="h-4 w-4" /> Default hero photo</Link>
          <a href="/" target="_blank" rel="noreferrer" className="btn-secondary"><ExternalLink className="h-4 w-4" /> View homepage</a>
        </>}
      />
      <SeasonsEditor
        key={`${state.draftUpdatedAt ?? "init"}-${state.publishedAt ?? "none"}`}
        initial={state.draft}
        canEdit={canEdit}
        status={status}
        previewUrls={previewUrls}
        pickLabels={pickLabels}
        initialSeason={(draftSeason ?? liveSeason ?? "fall") as Season}
      />
    </>
  );
}

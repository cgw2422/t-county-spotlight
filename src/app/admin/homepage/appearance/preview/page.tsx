import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { getHeroAppearance } from "@/lib/hero-appearance";
import { PreviewHero } from "./preview-hero";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Hero draft preview", robots: { index: false, follow: false, nocache: true } };

/**
 * Full homepage hero rendered with the DRAFT appearance. Covers the admin
 * shell (fixed, full-screen) so it can be opened in a tab or embedded as an
 * iframe by the Homepage appearance editor (?embed=1), which pushes unsaved
 * edits into it with postMessage.
 */
export default async function HeroPreviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const sp = await searchParams;
  const embed = sp.embed === "1";
  const [settings, section, draft] = await Promise.all([
    getSettings(),
    db.homepageSection.findFirst({ where: { type: "hero" }, select: { title: true, subtitle: true } }),
    getHeroAppearance({ draft: true }),
  ]);
  return (
    <div className="fixed inset-0 z-[200] overflow-y-auto overflow-x-hidden bg-cream">
      {!embed && (
        <div className="flex flex-wrap items-center justify-between gap-2 bg-sunset-500 px-4 py-2 text-sm font-semibold text-navy-900">
          <span>Draft preview — not live. Visitors still see the published hero.</span>
          <Link href="/admin/homepage/appearance/" className="underline">Back to Homepage appearance</Link>
        </div>
      )}
      <PreviewHero headline={section?.title || settings.heroHeadline} sub={section?.subtitle || settings.heroSubheadline} initial={draft} embed={embed} />
    </div>
  );
}

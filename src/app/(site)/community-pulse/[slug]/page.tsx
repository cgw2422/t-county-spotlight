import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getRelatedPulses, pulseHref, publicPulseWhere } from "@/lib/pulse";
import { PulseView, pulseViewInclude } from "@/components/pulse/pulse-view";
import { buildMetadata } from "@/components/public/seo";
import { followRedirectIfAny, isSaved } from "@/components/public/server";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

/** Published and archived entries are public; drafts and deleted entries 404. */
async function load(slug: string) {
  return db.communityPulse.findFirst({ where: publicPulseWhere({ slug: decodeURIComponent(slug).toLowerCase() }, { includeArchived: true }), include: pulseViewInclude });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await load((await params).slug);
  if (!p) return {};
  return buildMetadata({
    title: p.seoTitle || p.title,
    description: p.seoDescription || p.description || p.intro,
    path: pulseHref(p),
    image: p.ogImageUrl || p.featuredImageUrl,
    type: "article",
    publishedTime: p.publishedAt,
    modifiedTime: p.resultsUpdatedAt ?? p.updatedAt,
  });
}

export default async function PulsePage({ params }: Props) {
  const { slug } = await params;
  const p = await load(slug);
  if (!p) {
    await followRedirectIfAny(`/community-pulse/${slug}/`);
    notFound();
  }
  const [related, saved] = await Promise.all([getRelatedPulses(p), isSaved("PULSE", p.id)]);
  return <PulseView p={p} related={related} saved={saved} />;
}

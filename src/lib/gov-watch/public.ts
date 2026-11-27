import "server-only";
import { db } from "@/lib/db";
import { slugify } from "@/lib/utils";

/**
 * Data for the public Government Watch section (off until an admin turns it on). Only human-reviewed content is
 * public: documents marked Reviewed (their summary and original file) and stories marked Reviewed or Published.
 */
export const PUBLIC_FINDING = { reviewStatus: { in: ["reviewed", "published"] } };
export const PUBLIC_DOC = { reviewStatus: "reviewed", supersededAt: null };
export const communitySlug = (c: string) => slugify(c);

export async function publicCommunities() {
  const sources = await db.govSource.findMany({ select: { community: true, _count: { select: { documents: { where: PUBLIC_DOC } } } } });
  const m = new Map<string, number>();
  for (const s of sources) m.set(s.community, (m.get(s.community) ?? 0) + s._count.documents);
  return [...m.entries()].map(([name, docs]) => ({ name, slug: communitySlug(name), docs })).sort((a, b) => a.name.localeCompare(b.name));
}

export async function communityFromSlug(slug: string) {
  return (await publicCommunities()).find((c) => c.slug === slug) ?? null;
}

export async function upcomingPublicMeetings(community?: string, take = 8) {
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  return db.govFinding.findMany({
    where: { ...PUBLIC_FINDING, eventDate: { gte: today }, ...(community ? { document: { source: { community } } } : {}) },
    orderBy: { eventDate: "asc" }, take,
    select: { id: true, headline: true, detail: true, eventDate: true, document: { select: { id: true, source: { select: { name: true } } } } },
  });
}

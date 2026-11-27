import "server-only";
import { db } from "@/lib/db";
import { STARTER_SOURCES } from "./starter-sources";

/**
 * Adds the researched starter sources that aren't in the list yet (matched by name; existing sources are never
 * changed). All start as "needs review". Only sources with a minutes or agendas address are checked daily
 * until they're reviewed; the rest are off until an address is added.
 */
export async function loadStarterSources() {
  const existing = new Set((await db.govSource.findMany({ select: { name: true } })).map((s) => s.name));
  const add = STARTER_SOURCES.filter((s) => !existing.has(s.name));
  if (add.length) {
    await db.govSource.createMany({
      data: add.map((s) => ({
        name: s.name, community: s.community, govType: s.govType, website: s.website, minutesUrl: s.minutesUrl, agendasUrl: s.agendasUrl,
        clerkName: s.clerkName, clerkTitle: s.clerkTitle, clerkEmail: s.clerkEmail?.toLowerCase() ?? null, clerkPhone: s.clerkPhone,
        collectionMethod: s.collectionMethod, verification: "needs_review", notes: s.notes, evidence: s.evidence,
        active: !!(s.minutesUrl || s.agendasUrl),
      })),
      skipDuplicates: true,
    });
  }
  return { added: add.length, skipped: STARTER_SOURCES.length - add.length };
}

/** Distinct communities (for filters). */
export async function sourceCommunities() {
  const rows = await db.govSource.findMany({ distinct: ["community"], select: { community: true }, orderBy: { community: "asc" } });
  return rows.map((r) => r.community);
}

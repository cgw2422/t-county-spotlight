/**
 * One-time data repair: plain-text names/titles that were stored HTML-encoded
 * ("T REX FLESH &amp; Chicken Nuggets") by the WordPress import (raw titles)
 * or by the old plain-text sanitizer. Decodes entities in those fields only —
 * never article bodies or other rich text. Every change is recorded (before /
 * after) in the `entityRepairLog` setting for rollback. Guarded by a marker.
 */
import type { PrismaClient, Prisma } from "../generated/prisma/client";
import { collapseDoubleEncoded, decodePlainText, hasHtmlEntities } from "./text";

const MARKER = "repairEntityNames";
const VERSION = "2026-11-entities-v1";

// model delegate → plain-text fields
const FIELDS: Record<string, string[]> = {
  business: ["name", "tagline", "seoTitle", "seoDescription"],
  organization: ["name", "tagline", "orgType", "denomination", "seoTitle", "seoDescription"],
  article: ["title", "seoTitle", "seoDescription", "authorName", "featuredImageAlt"],
  page: ["title", "seoTitle", "seoDescription"],
  event: ["title", "locationName", "organizer"],
  promotion: ["title"],
  job: ["title", "employerName"],
  businessCategory: ["name"],
  category: ["name"],
  tag: ["name"],
  eventCategory: ["name"],
  pulseCategory: ["name"],
  communityPulse: ["title", "seoTitle", "seoDescription"],
  pulseResult: ["name"],
  user: ["name"],
};

type Delegate = {
  findMany: (args: unknown) => Promise<Record<string, unknown>[]>;
  update: (args: unknown) => Promise<unknown>;
};

export async function runEntityRepair(db: PrismaClient, log: (m: string) => void = console.log) {
  const done = await db.setting.findUnique({ where: { key: MARKER } });
  if ((done?.value as { version?: string } | null)?.version === VERSION) return { skipped: true };
  const changes: { model: string; id: string; field: string; before: string; after: string }[] = [];
  for (const [model, fields] of Object.entries(FIELDS)) {
    const delegate = (db as unknown as Record<string, Delegate>)[model];
    if (!delegate) continue;
    const rows = await delegate.findMany({
      where: { OR: fields.map((f) => ({ [f]: { contains: "&" } })) },
      select: Object.fromEntries([["id", true], ...fields.map((f) => [f, true])]),
    });
    for (const row of rows) {
      const data: Record<string, string> = {};
      for (const f of fields) {
        const v = row[f];
        if (typeof v === "string" && hasHtmlEntities(v)) {
          const fixed = decodePlainText(v);
          if (fixed !== v) { data[f] = fixed; changes.push({ model, id: String(row.id), field: f, before: v, after: fixed }); }
        }
      }
      if (Object.keys(data).length) await delegate.update({ where: { id: row.id }, data });
    }
  }
  if (changes.length) {
    await db.setting.upsert({
      where: { key: "entityRepairLog" },
      create: { key: "entityRepairLog", value: changes as unknown as Prisma.InputJsonValue },
      update: { value: changes as unknown as Prisma.InputJsonValue },
    });
  }
  await db.setting.upsert({
    where: { key: MARKER },
    create: { key: MARKER, value: { version: VERSION, at: new Date().toISOString(), changed: changes.length } },
    update: { value: { version: VERSION, at: new Date().toISOString(), changed: changes.length } },
  });
  log(`[repair] decoded HTML entities in ${changes.length} plain-text field(s)`);
  return { skipped: false, changed: changes.length };
}

// ── v2: double-encoded entities in descriptions ("T Rex Flesh &amp;amp; Chicken Nuggets") ──
const RICH_MARKER = "repairDoubleEncodedText";
const RICH_VERSION = "2026-11-double-encoded-v1";

// HTML fields: collapse "&amp;amp;" → "&amp;" (stays valid, escaped HTML; never adds markup).
const HTML_FIELDS: Record<string, string[]> = {
  business: ["description", "story"],
  organization: ["description"],
  event: ["description"],
  promotion: ["description", "terms"],
  job: ["description"],
};
// Plain-text fields (rendered as React text): decode to real characters.
const PLAIN_FIELDS: Record<string, string[]> = {
  organization: ["mission"],
  businessOfferingItem: ["description"],
  businessOfferingSection: ["description"],
  volunteerOpportunity: ["requirements"],
  communityNeed: ["instructions"],
  businessUpdate: ["body"],
  garageSale: ["description"],
  pulseResult: ["description"],
  communityPulse: ["description"],
};

/** One-time, logged repair of double-encoded entities in description fields. Article bodies are never touched. */
export async function runDoubleEncodedRepair(db: PrismaClient, log: (m: string) => void = console.log) {
  const done = await db.setting.findUnique({ where: { key: RICH_MARKER } });
  if ((done?.value as { version?: string } | null)?.version === RICH_VERSION) return { skipped: true };
  const changes: { model: string; id: string; field: string; before: string; after: string }[] = [];
  const passes: [Record<string, string[]>, (v: string) => string, (v: string) => boolean][] = [
    [HTML_FIELDS, collapseDoubleEncoded, (v) => /&amp;(#x[0-9a-f]+;|#\d+;|[a-z][a-z0-9]*;)/i.test(v)],
    [PLAIN_FIELDS, decodePlainText, hasHtmlEntities],
  ];
  for (const [map, fix, needs] of passes) {
    for (const [model, fields] of Object.entries(map)) {
      const delegate = (db as unknown as Record<string, Delegate>)[model];
      if (!delegate) continue;
      const rows = await delegate.findMany({
        where: { OR: fields.map((f) => ({ [f]: { contains: "&" } })) },
        select: Object.fromEntries([["id", true], ...fields.map((f) => [f, true])]),
      });
      for (const row of rows) {
        const data: Record<string, string> = {};
        for (const f of fields) {
          const v = row[f];
          if (typeof v === "string" && needs(v)) {
            const fixed = fix(v);
            if (fixed !== v) { data[f] = fixed; changes.push({ model, id: String(row.id), field: f, before: v, after: fixed }); }
          }
        }
        if (Object.keys(data).length) await delegate.update({ where: { id: row.id }, data });
      }
    }
  }
  if (changes.length) {
    await db.setting.upsert({
      where: { key: "doubleEncodedRepairLog" },
      create: { key: "doubleEncodedRepairLog", value: changes as unknown as Prisma.InputJsonValue },
      update: { value: changes as unknown as Prisma.InputJsonValue },
    });
  }
  const value = { version: RICH_VERSION, at: new Date().toISOString(), changed: changes.length };
  await db.setting.upsert({ where: { key: RICH_MARKER }, create: { key: RICH_MARKER, value }, update: { value } });
  log(`[repair] fixed double-encoded entities in ${changes.length} description field(s)`);
  return { skipped: false, changed: changes.length };
}

/**
 * One-time data repair: plain-text names/titles that were stored HTML-encoded
 * ("T REX FLESH &amp; Chicken Nuggets") by the WordPress import (raw titles)
 * or by the old plain-text sanitizer. Decodes entities in those fields only —
 * never article bodies or other rich text. Every change is recorded (before /
 * after) in the `entityRepairLog` setting for rollback. Guarded by a marker.
 */
import type { PrismaClient, Prisma } from "../generated/prisma/client";
import { decodePlainText, hasHtmlEntities } from "./text";

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

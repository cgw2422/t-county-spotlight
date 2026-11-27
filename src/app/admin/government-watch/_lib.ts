import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { CATEGORIES, DOC_TYPES, GOV_TYPES, PRIORITIES, isOneOf } from "@/lib/gov-watch/shared";
import { spGet, type SP } from "../_lib/list";

export const BASE = "/admin/government-watch";
export const fmtDate = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const day = (s: string, end = false) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T${end ? "23:59:59" : "00:00:00"}Z`) : null);

/** Filter values from the URL (only known values are kept). */
export function readFilters(sp: SP) {
  const v = {
    q: spGet(sp, "q").slice(0, 100), community: spGet(sp, "community").slice(0, 100), govType: spGet(sp, "govType"), docType: spGet(sp, "docType"),
    priority: spGet(sp, "priority"), category: spGet(sp, "category"), from: spGet(sp, "from"), to: spGet(sp, "to"),
  };
  return {
    values: v,
    community: v.community || null,
    govType: isOneOf(GOV_TYPES, v.govType) ? v.govType : null,
    docType: isOneOf(DOC_TYPES, v.docType) ? v.docType : null,
    priority: isOneOf(PRIORITIES, v.priority) ? v.priority : null,
    category: isOneOf(CATEGORIES, v.category) ? v.category : null,
    from: day(v.from), to: day(v.to, true),
  };
}
export type Filters = ReturnType<typeof readFilters>;

export function documentWhere(f: Filters): Prisma.GovDocumentWhereInput {
  const src: Prisma.GovSourceWhereInput = { ...(f.community ? { community: f.community } : {}), ...(f.govType ? { govType: f.govType } : {}) };
  return {
    ...(Object.keys(src).length ? { source: src } : {}),
    ...(f.docType ? { docType: f.docType } : {}),
    ...(f.from || f.to ? { meetingDate: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) } } : {}),
    ...(f.values.q ? { OR: [{ title: { contains: f.values.q, mode: "insensitive" } }, { summary: { contains: f.values.q, mode: "insensitive" } }, { emailSubject: { contains: f.values.q, mode: "insensitive" } }] } : {}),
  };
}

export function findingWhere(f: Filters): Prisma.GovFindingWhereInput {
  // Document filters apply to the story's document; the text search applies to the story itself.
  const doc = documentWhere({ ...f, values: { ...f.values, q: "" } });
  return {
    ...(Object.keys(doc).length ? { document: doc } : {}),
    ...(f.priority ? { priority: f.priority } : {}),
    ...(f.category ? { category: f.category } : {}),
    ...(f.values.q ? { OR: [{ headline: { contains: f.values.q, mode: "insensitive" } }, { detail: { contains: f.values.q, mode: "insensitive" } }] } : {}),
  };
}

export const qs = (values: Record<string, string>, extra: Record<string, string> = {}) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...values, ...extra })) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : "";
};

/** Time helpers (kept out of components). */
export const daysAgo = (n: number) => new Date(Date.now() - n * 86400_000);
export const startOfTodayUtc = () => new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");

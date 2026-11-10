import "server-only";
import crypto from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "./db";
import { hashToken, randomToken } from "./newsletter/tokens"; // same algorithms as ./auth, without next/navigation (runs from scripts/cron)
import { sendEmail } from "./email";
import { absoluteUrl, slugify } from "./utils";
import { addDaysKey, nyDateKey, startOfNyDay } from "@/components/public/dates";
import { publicLocation } from "./garage-sales-shared";

export function garageSaleHref(s: { slug: string }) {
  return `/garage-sales/${s.slug}/`;
}

/** Today's date key ("YYYY-MM-DD") in America/New_York. */
export function todayKey(now = new Date()) {
  return nyDateKey(now);
}

/** Published sales whose last day is today or later (expired sales drop out by date — no cron needed). */
export function activeSaleWhere(now = new Date()): Prisma.GarageSaleWhereInput {
  return { status: "PUBLISHED", endDate: { gte: startOfNyDay(todayKey(now)) } };
}

/** Published sales whose last day has passed. */
export function endedSaleWhere(now = new Date()): Prisma.GarageSaleWhereInput {
  return { status: "PUBLISHED", endDate: { lt: startOfNyDay(todayKey(now)) } };
}

export function isSaleEnded(s: { endDate: Date }, now = new Date()) {
  return s.endDate < startOfNyDay(todayKey(now));
}

export type SaleView = "today" | "tomorrow" | "weekend" | "all";

/** Inclusive NY date-key range for a list view. */
export function saleViewRange(view: SaleView, now = new Date()): { from: string; to: string } | null {
  const today = todayKey(now);
  if (view === "today") return { from: today, to: today };
  if (view === "tomorrow") { const t = addDaysKey(today, 1); return { from: t, to: t }; }
  if (view === "weekend") {
    const [y, m, d] = today.split("-").map(Number);
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 Sun .. 6 Sat
    const fri = addDaysKey(today, dow === 0 ? -2 : dow === 6 ? -1 : 5 - dow);
    const sun = addDaysKey(fri, 2);
    return { from: fri < today ? today : fri, to: sun };
  }
  return null;
}

/** Sales that run on at least one day of the range. */
export function overlapsRange(r: { from: string; to: string }): Prisma.GarageSaleWhereInput {
  return { startDate: { lte: startOfNyDay(r.to) }, endDate: { gte: startOfNyDay(r.from) } };
}

/** Fields needed to render a public card (address is reduced by toPublicSale). */
export const garageSaleCardSelect = {
  id: true, slug: true, title: true, description: true, saleType: true, itemCategories: true,
  address: true, generalLocation: true, addressVisibility: true, city: true, zip: true,
  startDate: true, endDate: true, dailyStart: true, dailyEnd: true, photos: true,
} satisfies Prisma.GarageSaleSelect;

type CardRow = Prisma.GarageSaleGetPayload<{ select: typeof garageSaleCardSelect }>;

/**
 * Public DTO. The private street address is removed unless the submitter chose
 * to show it — never pass raw rows to rendering code.
 */
export function toPublicSale(s: CardRow) {
  const exact = s.addressVisibility === "EXACT";
  const loc = publicLocation(s);
  return {
    id: s.id, slug: s.slug, title: s.title, description: s.description, saleType: s.saleType, itemCategories: s.itemCategories,
    addressVisibility: s.addressVisibility, address: exact ? s.address : null, generalLocation: s.generalLocation, city: s.city, zip: exact ? s.zip : null,
    locationLine: loc.line, startDate: s.startDate, endDate: s.endDate, dailyStart: s.dailyStart, dailyEnd: s.dailyEnd, photos: s.photos,
  };
}
export type PublicGarageSale = ReturnType<typeof toPublicSale>;

export async function getUpcomingGarageSales(opts: { view?: SaleView; city?: string; type?: string; category?: string; limit?: number; now?: Date } = {}) {
  const now = opts.now ?? new Date();
  const range = saleViewRange(opts.view ?? "all", now);
  const where: Prisma.GarageSaleWhereInput = {
    AND: [
      activeSaleWhere(now),
      range ? overlapsRange(range) : {},
      opts.city ? { city: { equals: opts.city, mode: "insensitive" } } : {},
      opts.type ? { saleType: opts.type as Prisma.GarageSaleWhereInput["saleType"] } : {},
      opts.category ? { itemCategories: { has: opts.category } } : {},
    ],
  };
  const rows = await db.garageSale.findMany({ where, select: garageSaleCardSelect, orderBy: [{ startDate: "asc" }, { dailyStart: "asc" }, { createdAt: "asc" }], take: opts.limit ?? 200 });
  return rows.map(toPublicSale);
}

export async function uniqueGarageSaleSlug(title: string, city: string | null, startKey: string) {
  const base = slugify(`${title} ${city ?? ""} ${startKey}`).slice(0, 70);
  if (!(await db.garageSale.findUnique({ where: { slug: base }, select: { id: true } }))) return base;
  return `${base}-${crypto.randomBytes(3).toString("hex")}`;
}

/** New manage token: returns the raw token (emailed once) and its hash (stored). */
export function newManageToken() {
  const token = randomToken(32);
  return { token, hash: hashToken(token) };
}

export function manageUrl(token: string) {
  return absoluteUrl(`/garage-sales/manage/?token=${encodeURIComponent(token)}`);
}

export async function findSaleByToken(token: string | null | undefined) {
  if (!token || token.length > 200) return null;
  return db.garageSale.findUnique({ where: { manageTokenHash: hashToken(token) } });
}

export async function emailManageLink(to: string, title: string, token: string, opts: { published: boolean; resubmitted?: boolean }) {
  const link = manageUrl(token);
  const intro = opts.published
    ? `Your sale “${title}” is published on T County Connect.`
    : opts.resubmitted
      ? `Thanks for updating “${title}”. Our team will review the changes shortly.`
      : `Thanks for listing “${title}” on T County Connect! We'll review it shortly and email you when it's live.`;
  await sendEmail(
    to,
    opts.published ? `Your garage sale “${title}” is live` : `We received your garage sale “${title}”`,
    `${intro}\n\nUse this private link to edit or remove your sale at any time:\n${link}\n\nKeep this link to yourself — anyone with it can change your listing. Your email address and name are never shown publicly.\n\n— T County Connect`,
  );
}

// ───────── Spam protection: signed "form opened at" stamp ─────────

function stampSecret() {
  return process.env.FORM_SECRET || process.env.DATABASE_URL || "tcounty-form";
}

/** Server-signed timestamp rendered into the form, used for the minimum time-on-form check. */
export function formStamp(now = Date.now()) {
  const t = String(now);
  return { t, sig: crypto.createHmac("sha256", stampSecret()).update(`garage-sale:${t}`).digest("hex").slice(0, 32) };
}

/** Seconds since the form was opened, or null if the stamp is missing or forged. */
export function formAgeSeconds(t: string, sig: string, now = Date.now()) {
  if (!/^\d{10,16}$/.test(t) || !/^[a-f0-9]{32}$/.test(sig)) return null;
  const expected = formStamp(Number(t)).sig;
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  const age = (now - Number(t)) / 1000;
  return age < 0 || age > 24 * 3600 ? null : age;
}

/** Site search: published, non-expired sales. Matches public fields only (never the private address or submitter). */
export async function searchGarageSales(q: string, limit = 8, opts: { city?: string | null; skip?: number } = {}) {
  const c = { contains: q, mode: "insensitive" as const };
  const where: Prisma.GarageSaleWhereInput = {
    AND: [
      activeSaleWhere(),
      { OR: [{ title: c }, { description: c }, { city: c }, { generalLocation: c }, { AND: [{ addressVisibility: "EXACT" }, { address: c }] }] },
      opts.city ? { city: { equals: opts.city, mode: "insensitive" } } : {},
    ],
  };
  const [count, rows] = await Promise.all([
    db.garageSale.count({ where }),
    limit > 0 ? db.garageSale.findMany({ where, select: garageSaleCardSelect, orderBy: [{ startDate: "asc" }, { id: "asc" }], skip: opts.skip ?? 0, take: limit }) : Promise.resolve([]),
  ]);
  return { count, rows: rows.map(toPublicSale) };
}

/** A signed-in resident's own sales (removed ones drop off after 30 days). */
export async function getUserGarageSales(userId: string) {
  return db.garageSale.findMany({
    where: { userId, OR: [{ status: { not: "REMOVED" } }, { removedAt: { gte: new Date(Date.now() - 30 * 86400_000) } }] },
    orderBy: { startDate: "desc" }, take: 10,
    select: { id: true, slug: true, title: true, status: true, startDate: true, endDate: true, city: true },
  });
}

import "server-only";
import { db } from "./db";
import crypto from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Server helpers for /list-your-business/ (new listings and claims of existing listings).
 *
 * Claimed listings: a business is "claimed" when it has at least one BusinessOwner with role
 * OWNER (assigned by staff or by an approved claim). "Claim This Business" is shown, and claim
 * applications are accepted and approved, only while a listing is unclaimed.
 *
 * Drafts: when someone fills the form, chooses "Create a Free Account" and the email already has an
 * account, the application fields (never the password) are kept server-side for a short while under a
 * random token. Only the token travels in the sign-in `next` URL; signing in brings them back to the
 * prefilled form. The token is stored hashed (Setting key `lyb-draft:<sha256>`), expires after
 * DRAFT_TTL_MS and is deleted once the application is submitted.
 */

/** Listings with at least one OWNER count as claimed (managers alone don't). */
export const claimedBusinessWhere: Prisma.BusinessWhereInput = { owners: { some: { role: "OWNER" } } };

export async function isBusinessClaimed(businessId: string, tx: Prisma.TransactionClient | typeof db = db) {
  return (await tx.businessOwner.count({ where: { businessId, role: "OWNER" } })) > 0;
}

export function claimedListingMessage(contactEmail?: string | null) {
  return `This listing is already managed. If you need access, contact T County Connect${contactEmail ? ` at ${contactEmail}` : ""}.`;
}

// ───────── Drafts ─────────

export const DRAFT_TTL_MS = 2 * 3600_000;
const DRAFT_PREFIX = "lyb-draft:";

export const DRAFT_FIELDS = ["businessName", "contactName", "firstName", "lastName", "phone", "website", "address", "city", "category", "message", "wantsSpotlight", "wantsJobPosting", "newsletter"] as const;
export type ApplicationDraft = Partial<Record<(typeof DRAFT_FIELDS)[number], string>> & { claimSlug?: string };

function draftKey(token: string) {
  return `${DRAFT_PREFIX}${crypto.createHash("sha256").update(token).digest("hex")}`;
}

/** Stores the entered fields (allowlisted, length-capped; never passwords) and returns the raw token. */
export async function saveApplicationDraft(fields: ApplicationDraft): Promise<string> {
  const clean: ApplicationDraft = {};
  for (const k of DRAFT_FIELDS) {
    const v = fields[k];
    if (typeof v === "string" && v) clean[k] = v.slice(0, k === "message" ? 3000 : 300);
  }
  if (fields.claimSlug) clean.claimSlug = fields.claimSlug.slice(0, 120);
  const token = crypto.randomBytes(24).toString("base64url");
  // Housekeeping: expired drafts are removed whenever a new one is saved.
  await db.setting.deleteMany({ where: { key: { startsWith: DRAFT_PREFIX }, updatedAt: { lt: new Date(Date.now() - DRAFT_TTL_MS) } } }).catch(() => {});
  await db.setting.create({ data: { key: draftKey(token), value: { exp: Date.now() + DRAFT_TTL_MS, fields: clean } as Prisma.InputJsonValue } });
  return token;
}

export async function loadApplicationDraft(token: string | null | undefined): Promise<ApplicationDraft | null> {
  if (!token || token.length < 20 || token.length > 100 || !/^[A-Za-z0-9_-]+$/.test(token)) return null;
  const row = await db.setting.findUnique({ where: { key: draftKey(token) } });
  const v = row?.value as { exp?: number; fields?: ApplicationDraft } | undefined;
  if (!v || typeof v.exp !== "number" || v.exp < Date.now() || !v.fields || typeof v.fields !== "object") return null;
  return v.fields;
}

export async function deleteApplicationDraft(token: string | null | undefined) {
  if (!token || token.length > 100) return;
  await db.setting.deleteMany({ where: { key: draftKey(token) } }).catch(() => {});
}

/** `/list-your-business/` URL for this application (claim and draft token kept). */
export function applicationPath(opts: { claimSlug?: string | null; draft?: string | null }) {
  const p = new URLSearchParams();
  if (opts.claimSlug) p.set("claim", opts.claimSlug);
  if (opts.draft) p.set("draft", opts.draft);
  const s = p.toString();
  return `/list-your-business/${s ? `?${s}` : ""}`;
}

export function signInToApplicationHref(opts: { claimSlug?: string | null; draft?: string | null }) {
  return `/login/?next=${encodeURIComponent(applicationPath(opts))}`;
}

/** My T County / account: this account's pending (and recently declined) requests, and the listings it manages. */
export async function getBusinessRequests(userId: string, now = new Date()) {
  const since = new Date(now.getTime() - 120 * 86400_000);
  const [apps, managed] = await Promise.all([
    db.businessApplication.findMany({
      where: { userId, OR: [{ status: "PENDING" }, { status: "REJECTED", reviewedAt: { gte: since } }] },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, businessName: true, status: true, createdAt: true },
    }),
    db.businessOwner.findMany({
      where: { userId, business: { deletedAt: null } },
      orderBy: { business: { name: "asc" } },
      select: { role: true, business: { select: { id: true, name: true, status: true } } },
    }),
  ]);
  return { apps, managed };
}

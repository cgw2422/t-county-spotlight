import "server-only";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { sanitizePlain } from "@/lib/sanitize";
import { hashRecommendationIp } from "@/lib/recommendations";
import { communityName } from "@/lib/my-t-county-shared";
import type { BusinessLeadStatus, Prisma } from "@/generated/prisma/client";
import { LEAD_LIMITS, leadMatchKey, normalizeBusinessName, normalizeTown, normalizeWebsite, websiteKey } from "./business-leads-shared";

/**
 * "Recommend a Business" — server side. Submissions are grouped into one BusinessLead per business (same normalized
 * name + town, or the same website / Facebook page); every submission is kept. Nothing here ever creates or publishes
 * a Business: staff review each lead and link it to an existing listing or create one through the normal admin form.
 */

export type LeadInput = { businessName: string; city: string; website?: string | null; category?: string | null; reason?: string | null; firstName?: string | null; email?: string | null };
export type CleanLead = { businessName: string; city: string; website: string | null; category: string | null; reason: string | null; firstName: string | null; email: string | null };

/** Plain-text, length-limited values (HTML stripped). City canonicalized to a community name when it matches one. */
export function cleanLeadInput(i: LeadInput): CleanLead {
  const city = sanitizePlain(i.city, LEAD_LIMITS.city);
  return {
    businessName: sanitizePlain(i.businessName, LEAD_LIMITS.name),
    city: communityName(city) ?? city,
    website: i.website ? normalizeWebsite(i.website) : null,
    category: sanitizePlain(i.category, LEAD_LIMITS.category) || null,
    reason: sanitizePlain(i.reason, LEAD_LIMITS.reason) || null,
    firstName: sanitizePlain(i.firstName, LEAD_LIMITS.firstName) || null,
    email: i.email ? i.email.trim().toLowerCase().slice(0, LEAD_LIMITS.email) || null : null,
  };
}

export type SubmitResult = { leadId: string; submissionId: string | null; duplicate: boolean; grouped: boolean };

/**
 * Records one recommendation. The same person (IP code or email) recommending the same business again within
 * 24 hours is accepted but not counted twice (refreshes / double taps).
 */
export async function submitBusinessLead(input: CleanLead, opts: { ip?: string | null; now?: Date } = {}): Promise<SubmitResult> {
  const now = opts.now ?? new Date();
  const ipHash = hashRecommendationIp(opts.ip);
  const key = leadMatchKey(input.businessName, input.city);
  const wKey = websiteKey(input.website);

  return db.$transaction(async (tx) => {
    // Same website / Facebook page → same business, even when the name is written differently.
    let lead = wKey ? await tx.businessLead.findFirst({ where: { websiteKey: wKey }, orderBy: { createdAt: "asc" } }) : null;
    let grouped = !!lead;
    if (!lead) {
      const existing = await tx.businessLead.findUnique({ where: { matchKey: key } });
      grouped = !!existing;
      lead = existing ?? await tx.businessLead.upsert({
        where: { matchKey: key },
        create: { matchKey: key, websiteKey: wKey, name: input.businessName, city: input.city, website: input.website, category: input.category, lastSubmittedAt: now },
        update: {},
      });
    }

    const since = new Date(now.getTime() - 24 * 3600_000);
    const repeat = await tx.businessLeadSubmission.findFirst({
      where: { leadId: lead.id, createdAt: { gte: since }, OR: [...(ipHash ? [{ ipHash }] : []), ...(input.email ? [{ submitterEmail: input.email }] : [])] },
      select: { id: true },
    });
    if (repeat && (ipHash || input.email)) return { leadId: lead.id, submissionId: null, duplicate: true, grouped };

    const sub = await tx.businessLeadSubmission.create({
      data: {
        leadId: lead.id, businessName: input.businessName, city: input.city, website: input.website, category: input.category,
        reason: input.reason, submitterFirstName: input.firstName, submitterEmail: input.email, ipHash, createdAt: now,
      },
    });
    await tx.businessLead.update({
      where: { id: lead.id },
      data: {
        submissionCount: { increment: 1 }, lastSubmittedAt: now,
        // Fill in details the first submissions didn't have; never overwrite what staff or earlier residents entered.
        ...(!lead.website && input.website ? { website: input.website } : {}),
        ...(!lead.websiteKey && wKey ? { websiteKey: wKey } : {}),
        ...(!lead.category && input.category ? { category: input.category } : {}),
      },
    });
    return { leadId: lead.id, submissionId: sub.id, duplicate: false, grouped };
  });
}

// ───────────── Admin ─────────────

export async function leadStats() {
  const [total, unique, awaiting, contacted, added] = await Promise.all([
    db.businessLeadSubmission.count(),
    db.businessLead.count(),
    db.businessLead.count({ where: { status: "NEW" } }),
    db.businessLead.count({ where: { contactedAt: { not: null } } }),
    db.businessLead.count({ where: { status: "ADDED", businessId: { not: null } } }),
  ]);
  return { total, unique, awaiting, contacted, added };
}

export const newLeadCount = () => db.businessLead.count({ where: { status: "NEW" } });

export type DirectoryMatch = { id: string; name: string; slug: string; city: string | null; status: string; exact: boolean };

/** Listings that look like this business (same normalized name, optionally same town; or the same website). */
export async function directoryMatches(lead: { name: string; city: string; website: string | null }, take = 8): Promise<DirectoryMatch[]> {
  const norm = normalizeBusinessName(lead.name);
  const words = norm.split(" ").filter((w) => w.length >= 3).slice(0, 3);
  const wKey = websiteKey(lead.website);
  const or: Prisma.BusinessWhereInput[] = words.map((w) => ({ name: { contains: w, mode: "insensitive" as const } }));
  if (wKey && !wKey.includes("/")) or.push({ website: { contains: wKey, mode: "insensitive" } });
  if (!or.length) return [];
  const rows = await db.business.findMany({ where: { deletedAt: null, OR: or }, select: { id: true, name: true, slug: true, city: true, status: true, website: true }, take: 60 });
  const town = normalizeTown(lead.city);
  const scored = rows.map((b) => {
    const nameEq = normalizeBusinessName(b.name) === norm;
    const siteEq = !!wKey && websiteKey(b.website) === wKey;
    const townEq = !!b.city && normalizeTown(b.city) === town;
    const overlap = words.filter((w) => normalizeBusinessName(b.name).split(" ").includes(w)).length;
    return { b, score: (siteEq ? 100 : 0) + (nameEq ? 50 : 0) + (townEq ? 10 : 0) + overlap, exact: siteEq || (nameEq && (townEq || !b.city)) };
  }).filter((x) => x.score >= 11 || x.exact || x.score >= 50);
  scored.sort((a, z) => z.score - a.score);
  return scored.slice(0, take).map(({ b, exact }) => ({ id: b.id, name: b.name, slug: b.slug, city: b.city, status: b.status, exact }));
}

/** For the list page: which leads already have an exact-name listing (in the same town or with no town). */
export async function exactDirectoryHits(leads: { id: string; name: string; city: string }[]) {
  if (!leads.length) return new Map<string, { id: string; name: string }>();
  const words = [...new Set(leads.flatMap((l) => normalizeBusinessName(l.name).split(" ").filter((w) => w.length >= 3).slice(0, 1)))];
  const rows = words.length
    ? await db.business.findMany({ where: { deletedAt: null, OR: words.map((w) => ({ name: { contains: w, mode: "insensitive" as const } })) }, select: { id: true, name: true, city: true } })
    : [];
  const out = new Map<string, { id: string; name: string }>();
  for (const l of leads) {
    const n = normalizeBusinessName(l.name), t = normalizeTown(l.city);
    const hit = rows.find((b) => normalizeBusinessName(b.name) === n && (!b.city || normalizeTown(b.city) === t));
    if (hit) out.set(l.id, { id: hit.id, name: hit.name });
  }
  return out;
}

export class LeadError extends Error {}

/** Status + private notes. ADDED requires a linked listing; contactedAt/addedAt track outcomes for the stats. */
export async function updateLead(leadId: string, data: { status: BusinessLeadStatus; adminNotes: string | null }, actorId: string | null) {
  const lead = await db.businessLead.findUnique({ where: { id: leadId } });
  if (!lead) throw new LeadError("Recommendation not found.");
  if (data.status === "ADDED" && !lead.businessId) throw new LeadError("Link this recommendation to a listing (or create one) before marking it Added.");
  const now = new Date();
  await db.businessLead.update({
    where: { id: lead.id },
    data: {
      status: data.status,
      adminNotes: data.adminNotes,
      ...(data.status === "CONTACTED" && !lead.contactedAt ? { contactedAt: now } : {}),
      addedAt: data.status === "ADDED" ? lead.addedAt ?? now : null,
    },
  });
  if (lead.status !== data.status) await audit(actorId, "business_lead.status", "BusinessLead", lead.id, { from: lead.status, to: data.status, name: lead.name });
  if ((lead.adminNotes ?? "") !== (data.adminNotes ?? "")) await audit(actorId, "business_lead.notes", "BusinessLead", lead.id, { name: lead.name });
}

/** Link to an EXISTING listing (no status change; staff decide whether it counts as Added). */
export async function linkLead(leadId: string, businessId: string, actorId: string | null) {
  const [lead, b] = await Promise.all([db.businessLead.findUnique({ where: { id: leadId } }), db.business.findFirst({ where: { id: businessId, deletedAt: null }, select: { id: true, name: true } })]);
  if (!lead) throw new LeadError("Recommendation not found.");
  if (!b) throw new LeadError("That listing no longer exists.");
  await db.businessLead.update({ where: { id: lead.id }, data: { businessId: b.id, createdFromLead: false } });
  await audit(actorId, "business_lead.link", "BusinessLead", lead.id, { name: lead.name, businessId: b.id, businessName: b.name });
}

export async function unlinkLead(leadId: string, actorId: string | null) {
  const lead = await db.businessLead.findUnique({ where: { id: leadId } });
  if (!lead) throw new LeadError("Recommendation not found.");
  await db.businessLead.update({ where: { id: lead.id }, data: { businessId: null, createdFromLead: false, ...(lead.status === "ADDED" ? { status: "REVIEWING", addedAt: null } : {}) } });
  await audit(actorId, "business_lead.unlink", "BusinessLead", lead.id, { name: lead.name, businessId: lead.businessId });
}

/**
 * Called by the admin business form after it creates a listing from a recommendation (?fromLead=). Links the lead;
 * it counts as Added only when the new listing was published — a draft listing leaves the lead in Reviewing.
 */
export async function attachNewBusinessToLead(leadId: string, business: { id: string; status: string }, actorId: string | null) {
  const lead = await db.businessLead.findUnique({ where: { id: leadId } });
  if (!lead || lead.businessId) return;
  const published = business.status === "PUBLISHED";
  await db.businessLead.update({
    where: { id: lead.id },
    data: { businessId: business.id, createdFromLead: true, status: published ? "ADDED" : lead.status === "NEW" ? "REVIEWING" : lead.status, ...(published ? { addedAt: new Date() } : {}) },
  });
  await audit(actorId, "business_lead.listing_created", "BusinessLead", lead.id, { name: lead.name, businessId: business.id, published });
}

/** Leads that look like the same business (manual grouping when automatic matching missed a variant). */
export async function similarLeads(lead: { id: string; name: string; city: string }) {
  const words = normalizeBusinessName(lead.name).split(" ").filter((w) => w.length >= 3).slice(0, 3);
  if (!words.length) return [];
  return db.businessLead.findMany({
    where: { id: { not: lead.id }, OR: words.map((w) => ({ name: { contains: w, mode: "insensitive" as const } })) },
    select: { id: true, name: true, city: true, status: true, submissionCount: true },
    orderBy: { submissionCount: "desc" }, take: 8,
  });
}

/** Moves every submission of `fromId` into `intoId` (kept as-is) and removes the empty `fromId` lead. */
export async function mergeLeads(fromId: string, intoId: string, actorId: string | null) {
  if (fromId === intoId) throw new LeadError("Pick a different recommendation to merge into.");
  await db.$transaction(async (tx) => {
    const [from, into] = await Promise.all([tx.businessLead.findUnique({ where: { id: fromId } }), tx.businessLead.findUnique({ where: { id: intoId } })]);
    if (!from || !into) throw new LeadError("Recommendation not found.");
    const moved = await tx.businessLeadSubmission.updateMany({ where: { leadId: from.id }, data: { leadId: into.id } });
    const notes = [into.adminNotes, from.adminNotes ? `[Merged from “${from.name}”] ${from.adminNotes}` : null].filter(Boolean).join("\n\n") || null;
    await tx.businessLead.update({
      where: { id: into.id },
      data: {
        submissionCount: { increment: moved.count },
        lastSubmittedAt: from.lastSubmittedAt > into.lastSubmittedAt ? from.lastSubmittedAt : into.lastSubmittedAt,
        adminNotes: notes,
        ...(!into.website && from.website ? { website: from.website } : {}),
        ...(!into.websiteKey && from.websiteKey ? { websiteKey: from.websiteKey } : {}),
        ...(!into.category && from.category ? { category: from.category } : {}),
        ...(!into.businessId && from.businessId ? { businessId: from.businessId, createdFromLead: from.createdFromLead } : {}),
        ...(!into.contactedAt && from.contactedAt ? { contactedAt: from.contactedAt } : {}),
      },
    });
    await tx.businessLead.delete({ where: { id: from.id } });
  });
  await audit(actorId, "business_lead.merge", "BusinessLead", intoId, { mergedFrom: fromId });
}

import "server-only";
import { db } from "@/lib/db";
import { suggestionKindLabel } from "@/lib/suggestions-shared";
import { OPENING_LABELS } from "@/lib/openings-shared";

export const SUBMISSION_TYPES = [
  { key: "event", label: "Events" },
  { key: "garage_sale", label: "Garage sales" },
  { key: "application", label: "Business applications" },
  { key: "organization", label: "Nonprofits & churches" },
  { key: "claim", label: "Ownership claims" },
  { key: "special", label: "Specials" },
  { key: "update", label: "Business updates" },
  { key: "job", label: "Jobs" },
  { key: "article", label: "Articles" },
  { key: "suggestion", label: "Resident suggestions" },
] as const;
export type SubmissionType = (typeof SUBMISSION_TYPES)[number]["key"];

export type SubmissionRow = {
  type: SubmissionType;
  id: string;
  title: string;
  detail?: string | null;
  submittedAt: Date;
  submitterName?: string | null;
  submitterEmail?: string | null;
  status: string;
  reviewHref: string;
};

/** Pending counts per type (same filters as the existing review screens and sidebar badges). */
export async function pendingCounts() {
  const [event, garage_sale, application, organization, claim, special, update, job, article, suggestion] = await Promise.all([
    db.event.count({ where: { status: "PENDING", deletedAt: null } }),
    db.garageSale.count({ where: { status: "PENDING" } }),
    db.businessApplication.count({ where: { status: "PENDING" } }),
    db.organization.count({ where: { status: "PENDING", deletedAt: null } }),
    db.organizationClaim.count({ where: { status: "PENDING" } }),
    db.promotion.count({ where: { status: "PENDING", deletedAt: null } }),
    db.businessUpdate.count({ where: { status: "PENDING" } }),
    db.job.count({ where: { status: "PENDING", deletedAt: null } }),
    db.article.count({ where: { status: "PENDING", deletedAt: null } }),
    db.communitySuggestion.count({ where: { status: "PENDING" } }),
  ]);
  const counts: Record<SubmissionType, number> = { event, garage_sale, application, organization, claim, special, update, job, article, suggestion };
  return { counts, total: Object.values(counts).reduce((a, b) => a + b, 0) };
}

const TAKE = 100;

/** Everything awaiting review, oldest first. Private submitter details are for staff pages only. */
export async function pendingSubmissions(type?: SubmissionType): Promise<SubmissionRow[]> {
  const want = (t: SubmissionType) => !type || type === t;
  const [events, sales, apps, orgs, claims, specials, updates, jobs, articles, suggestions] = await Promise.all([
    want("event") ? db.event.findMany({ where: { status: "PENDING", deletedAt: null }, orderBy: { createdAt: "asc" }, take: TAKE, select: { id: true, title: true, startAt: true, city: true, createdAt: true, status: true, submitterEmail: true, submittedBy: { select: { name: true, email: true } }, business: { select: { name: true } } } }) : [],
    want("garage_sale") ? db.garageSale.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, take: TAKE, select: { id: true, title: true, city: true, createdAt: true, updatedAt: true, publishedAt: true, status: true, submitterName: true, submitterEmail: true } }) : [],
    want("application") ? db.businessApplication.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, take: TAKE, select: { id: true, businessName: true, city: true, createdAt: true, status: true, contactName: true, email: true } }) : [],
    want("organization") ? db.organization.findMany({ where: { status: "PENDING", deletedAt: null }, orderBy: { createdAt: "asc" }, take: TAKE, select: { id: true, name: true, kind: true, city: true, createdAt: true, status: true, email: true, createdById: true } }) : [],
    want("claim") ? db.organizationClaim.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, take: TAKE, select: { id: true, createdAt: true, status: true, applicantName: true, email: true, emailVerifiedAt: true, organization: { select: { name: true } } } }) : [],
    want("special") ? db.promotion.findMany({ where: { status: "PENDING", deletedAt: null }, orderBy: { createdAt: "asc" }, take: TAKE, select: { id: true, title: true, createdAt: true, status: true, createdById: true, business: { select: { name: true } } } }) : [],
    want("update") ? db.businessUpdate.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, take: TAKE, select: { id: true, title: true, kind: true, createdAt: true, status: true, businessName: true, business: { select: { name: true } } } }) : [],
    want("job") ? db.job.findMany({ where: { status: "PENDING", deletedAt: null }, orderBy: { createdAt: "asc" }, take: TAKE, select: { id: true, title: true, createdAt: true, status: true, business: { select: { name: true } } } }) : [],
    want("article") ? db.article.findMany({ where: { status: "PENDING", deletedAt: null }, orderBy: { createdAt: "asc" }, take: TAKE, select: { id: true, title: true, kind: true, createdAt: true, status: true, author: { select: { name: true, email: true } } } }) : [],
    want("suggestion") ? db.communitySuggestion.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, take: TAKE, select: { id: true, kind: true, title: true, city: true, createdAt: true, updatedAt: true, status: true, submitterName: true, submitterEmail: true } }) : [],
  ]);
  const creatorIds = [...orgs.map((o) => o.createdById), ...specials.map((s) => s.createdById)].filter((x): x is string => !!x);
  const creators = creatorIds.length ? await db.user.findMany({ where: { id: { in: creatorIds } }, select: { id: true, name: true, email: true } }) : [];
  const creator = (id: string | null) => (id ? creators.find((u) => u.id === id) : undefined);

  const rows: SubmissionRow[] = [
    ...events.map((e) => ({ type: "event" as const, id: e.id, title: e.title, detail: [e.startAt.toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" }), e.city].filter(Boolean).join(" · "), submittedAt: e.createdAt, submitterName: e.submittedBy?.name ?? e.business?.name ?? null, submitterEmail: e.submitterEmail || e.submittedBy?.email || null, status: e.status, reviewHref: `/admin/events/${e.id}/` })),
    ...sales.map((s) => ({ type: "garage_sale" as const, id: s.id, title: s.title, detail: [s.city, s.publishedAt ? "Edited after publishing" : null].filter(Boolean).join(" · "), submittedAt: s.publishedAt ? s.updatedAt : s.createdAt, submitterName: s.submitterName, submitterEmail: s.submitterEmail, status: s.status, reviewHref: `/admin/garage-sales/${s.id}/` })),
    ...apps.map((a) => ({ type: "application" as const, id: a.id, title: a.businessName, detail: a.city, submittedAt: a.createdAt, submitterName: a.contactName, submitterEmail: a.email, status: a.status, reviewHref: `/admin/applications/${a.id}/` })),
    ...orgs.map((o) => ({ type: "organization" as const, id: o.id, title: o.name, detail: [o.kind === "CHURCH" ? "Church" : o.kind === "COMMUNITY_GROUP" ? "Community group" : "Nonprofit", o.city].filter(Boolean).join(" · "), submittedAt: o.createdAt, submitterName: creator(o.createdById)?.name ?? null, submitterEmail: creator(o.createdById)?.email ?? o.email, status: o.status, reviewHref: `/admin/organizations/${o.id}/` })),
    ...claims.map((c) => ({ type: "claim" as const, id: c.id, title: `Claim: ${c.organization.name}`, detail: c.emailVerifiedAt ? "Email confirmed" : "Email not confirmed yet", submittedAt: c.createdAt, submitterName: c.applicantName, submitterEmail: c.email, status: c.status, reviewHref: "/admin/organizations/claims/" })),
    ...specials.map((p) => ({ type: "special" as const, id: p.id, title: p.title, detail: p.business.name, submittedAt: p.createdAt, submitterName: creator(p.createdById)?.name ?? p.business.name, submitterEmail: creator(p.createdById)?.email ?? null, status: p.status, reviewHref: `/admin/specials/${p.id}/` })),
    ...updates.map((u) => ({ type: "update" as const, id: u.id, title: u.title, detail: [u.kind !== "GENERAL" ? OPENING_LABELS[u.kind as keyof typeof OPENING_LABELS] : null, u.business?.name ?? u.businessName].filter(Boolean).join(" · ") || null, submittedAt: u.createdAt, submitterName: u.business?.name ?? u.businessName ?? null, submitterEmail: null, status: u.status, reviewHref: `/admin/updates/${u.id}/` })),
    ...jobs.map((j) => ({ type: "job" as const, id: j.id, title: j.title, detail: j.business?.name ?? null, submittedAt: j.createdAt, submitterName: j.business?.name ?? null, submitterEmail: null, status: j.status, reviewHref: `/admin/jobs/${j.id}/` })),
    ...suggestions.map((g) => ({ type: "suggestion" as const, id: g.id, title: g.title, detail: [suggestionKindLabel(g.kind), g.city].filter(Boolean).join(" · "), submittedAt: g.createdAt, submitterName: g.submitterName, submitterEmail: g.submitterEmail, status: g.status, reviewHref: `/admin/suggestions/${g.id}/` })),
    ...articles.map((a) => ({ type: "article" as const, id: a.id, title: a.title, detail: a.kind.replace(/_/g, " ").toLowerCase(), submittedAt: a.createdAt, submitterName: a.author?.name ?? null, submitterEmail: a.author?.email ?? null, status: a.status, reviewHref: `/admin/articles/${a.id}/` })),
  ];
  return rows.sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime());
}

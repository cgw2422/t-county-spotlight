import "server-only";
import { db } from "@/lib/db";

/** CSV cell with spreadsheet formula-injection guard. */
export function csvCell(v: string | null | undefined) {
  let s = v ?? "";
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export function toCsv(header: string[], rows: (string | null | undefined)[][]) {
  return [header.join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\r\n") + "\r\n";
}

async function suppressedEmails() {
  return new Set((await db.emailSuppression.findMany({ select: { email: true } })).map((s) => s.email.trim().toLowerCase()));
}

/**
 * Subscribers safe to import into beehiiv: confirmed + ACTIVE, never
 * unsubscribed, and not on the suppression list (compared case-insensitively).
 */
export async function beehiivImportRows() {
  const [subs, suppressed] = await Promise.all([
    db.newsletterSubscriber.findMany({
      where: { status: "ACTIVE", confirmedAt: { not: null }, unsubscribedAt: null },
      orderBy: { confirmedAt: "asc" },
      select: { email: true, firstName: true, source: true, confirmedAt: true, createdAt: true, communities: true },
    }),
    suppressedEmails(),
  ]);
  return subs.filter((s) => !suppressed.has(s.email.trim().toLowerCase()));
}

/** beehiiv importer columns: email (required) + optional fields you can map to custom fields during import. */
export const BEEHIIV_IMPORT_HEADER = ["email", "first_name", "created_at", "utm_source", "signup_source", "community"];

export async function beehiivImportCsv() {
  const rows = await beehiivImportRows();
  return {
    count: rows.length,
    csv: toCsv(BEEHIIV_IMPORT_HEADER, rows.map((s) => [s.email.trim().toLowerCase(), s.firstName, (s.confirmedAt ?? s.createdAt).toISOString(), "tcountyconnect", s.source, s.communities.join("; ")])),
  };
}

/** Everyone who must never be imported: the suppression list plus any unsubscribed / bounced / complained subscriber. */
export async function suppressionRows() {
  const [supp, removed] = await Promise.all([
    db.emailSuppression.findMany({ orderBy: { createdAt: "asc" } }),
    db.newsletterSubscriber.findMany({ where: { OR: [{ status: { in: ["UNSUBSCRIBED", "BOUNCED", "COMPLAINED"] } }, { unsubscribedAt: { not: null } }] }, select: { email: true, status: true, unsubscribedAt: true, updatedAt: true } }),
  ]);
  const out = new Map<string, { email: string; reason: string; date: string; source: string }>();
  for (const s of supp) out.set(s.email.trim().toLowerCase(), { email: s.email.trim().toLowerCase(), reason: s.reason, date: s.createdAt.toISOString(), source: "suppression_list" });
  for (const r of removed) {
    const e = r.email.trim().toLowerCase();
    if (!out.has(e)) out.set(e, { email: e, reason: r.status.toLowerCase(), date: (r.unsubscribedAt ?? r.updatedAt).toISOString(), source: "subscriber_status" });
  }
  return [...out.values()];
}

export async function suppressionCsv() {
  const rows = await suppressionRows();
  return { count: rows.length, csv: toCsv(["email", "reason", "date", "source"], rows.map((r) => [r.email, r.reason, r.date, r.source])) };
}

export async function subscriberCounts() {
  const [byStatus, suppressed, exportable] = await Promise.all([
    db.newsletterSubscriber.groupBy({ by: ["status"], _count: { _all: true } }),
    db.emailSuppression.count(),
    beehiivImportRows().then((r) => r.length),
  ]);
  const n = (s: string) => byStatus.find((g) => g.status === s)?._count._all ?? 0;
  return { active: exportable, pending: n("PENDING"), unsubscribed: n("UNSUBSCRIBED"), bouncedOrComplained: n("BOUNCED") + n("COMPLAINED"), suppressed };
}

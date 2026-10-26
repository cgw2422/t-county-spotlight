import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

function csv(v: string | null | undefined) {
  let s = v ?? "";
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // spreadsheet formula injection guard
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV of ACTIVE, confirmed, non-suppressed subscribers only. Admin-only and audit-logged. */
export async function GET() {
  const user = await requireAdmin();
  const subs = await db.newsletterSubscriber.findMany({
    where: { status: "ACTIVE", confirmedAt: { not: null } },
    orderBy: { confirmedAt: "asc" },
    select: { email: true, firstName: true, source: true, consentAt: true, consentVersion: true, confirmedAt: true },
  });
  const suppressed = new Set((await db.emailSuppression.findMany({ select: { email: true } })).map((s) => s.email));
  const rows = subs.filter((s) => !suppressed.has(s.email));
  const lines = [
    "email,first_name,source,consent_timestamp,consent_version,confirmed_at",
    ...rows.map((s) => [s.email, s.firstName, s.source, s.consentAt?.toISOString(), s.consentVersion, s.confirmedAt?.toISOString()].map(csv).join(",")),
  ];
  await audit(user.id, "newsletter.export", "NewsletterSubscriber", undefined, { rows: rows.length });
  const date = new Date().toISOString().slice(0, 10);
  return new Response(lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="t-county-weekly-subscribers-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

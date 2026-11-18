import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { beehiivImportCsv } from "@/lib/newsletter/export";

export const dynamic = "force-dynamic";

/** "Export for beehiiv": confirmed, active, never-unsubscribed, non-suppressed subscribers. Admin-only, audited; sends nothing, imports nothing. */
export async function GET() {
  const user = await requireAdmin();
  const { csv, count } = await beehiivImportCsv();
  await audit(user.id, "newsletter.export_beehiiv", "NewsletterSubscriber", undefined, { rows: count });
  const date = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="beehiiv-import-${date}.csv"`, "Cache-Control": "no-store" },
  });
}

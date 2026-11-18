import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { suppressionCsv } from "@/lib/newsletter/export";

export const dynamic = "force-dynamic";

/** "Export unsubscribes & suppressions": addresses that must never be imported into beehiiv. Admin-only, audited. */
export async function GET() {
  const user = await requireAdmin();
  const { csv, count } = await suppressionCsv();
  await audit(user.id, "newsletter.export_suppressions", "EmailSuppression", undefined, { rows: count });
  const date = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="do-not-import-unsubscribes-suppressions-${date}.csv"`, "Cache-Control": "no-store" },
  });
}

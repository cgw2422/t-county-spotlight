import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { toCsv } from "@/lib/gives/csv";
import { OUTCOME_LABEL, type ImportResult } from "@/lib/gives/import";
import { slugify } from "@/lib/utils";

/** Rows that were not created/updated, with the reason, plus the original columns. Admin only. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin();
  const { id } = await params;
  const imp = await db.organizationImport.findUnique({ where: { id } });
  if (!imp || !Array.isArray(imp.results)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const rows = (Array.isArray(imp.rows) ? imp.rows : []) as string[][];
  const results = imp.results as unknown as ImportResult[];
  const out: unknown[][] = [["Row", "Outcome", "Reason", ...imp.headers]];
  for (const r of results) {
    if (r.outcome === "created" || r.outcome === "updated") continue;
    out.push([r.row, OUTCOME_LABEL[r.outcome] ?? r.outcome, r.message ?? "", ...(rows[r.row - 1] ?? [])]);
  }
  await audit(user.id, "organization_import.error_report", "OrganizationImport", imp.id, { rows: out.length - 1 });
  return new NextResponse(toCsv(out), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slugify(imp.filename.replace(/\.csv$/i, ""))}-not-imported.csv"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}

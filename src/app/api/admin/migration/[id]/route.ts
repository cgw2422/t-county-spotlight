import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { reportToMarkdown, type ImportReport } from "@/lib/wordpress/report";

/**
 * GET /api/admin/migration/<id>/            → run status JSON (for polling / scripts)
 * GET /api/admin/migration/<id>/?format=md  → Markdown report download
 * GET /api/admin/migration/<id>/?format=json → full JSON report download
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const { id } = await ctx.params;
  const run = await db.migrationRun.findUnique({ where: { id } });
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const format = new URL(req.url).searchParams.get("format");
  const stamp = run.startedAt.toISOString().slice(0, 19).replace(/[:T]/g, "-");
  if (format === "md") {
    if (!run.report) return NextResponse.json({ error: "Report not ready" }, { status: 409 });
    return new Response(reportToMarkdown(run.report as unknown as ImportReport), {
      headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename="migration-${stamp}.md"` },
    });
  }
  if (format === "json") {
    return new Response(JSON.stringify(run.report ?? null, null, 2), {
      headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="migration-${stamp}.json"` },
    });
  }
  return NextResponse.json({ id: run.id, status: run.status, source: run.source, startedAt: run.startedAt, finishedAt: run.finishedAt, logTail: run.log.slice(-4000), hasReport: !!run.report });
}

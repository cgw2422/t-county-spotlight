import { requireStaff } from "@/lib/auth";
import { analyticsCsv, analyticsRange, getCommunityAnalytics } from "@/lib/analytics";

export const dynamic = "force-dynamic";

/** CSV of the aggregate community analytics tables (counts only; no personal data). Staff only. */
export async function GET(req: Request) {
  await requireStaff();
  const range = analyticsRange(new URL(req.url).searchParams.get("range"));
  const body = analyticsCsv(await getCommunityAnalytics(range));
  const date = new Date().toISOString().slice(0, 10);
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="t-county-connect-analytics-${range.days}d-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader, Card } from "@/components/admin/page-header";
import { LinkTabs } from "@/components/admin/tabs";
import { StatusBadge } from "@/components/admin/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { spGet, type SP } from "../../_lib/list";

export const dynamic = "force-dynamic";
export const metadata = { title: "Community Pulse analytics" };

const TYPES = ["view_pulse", "click_pulse_business", "click_pulse_source"] as const;
const RANGES = [
  { key: "30", label: "Last 30 days", days: 30 },
  { key: "90", label: "Last 90 days", days: 90 },
  { key: "all", label: "All time", days: 0 },
] as const;

export default async function PulseAnalyticsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireStaff();
  const sp = await searchParams;
  const range = RANGES.find((r) => r.key === spGet(sp, "range")) ?? RANGES[0];
  const now = new Date();
  const since = range.days ? new Date(now.getTime() - range.days * 86400_000) : undefined;

  const [publishedCount, grouped] = await Promise.all([
    db.communityPulse.count({ where: { status: "PUBLISHED", deletedAt: null } }),
    db.engagementEvent.groupBy({
      by: ["targetId", "type"],
      where: { targetType: "PULSE", type: { in: [...TYPES] }, ...(since ? { createdAt: { gte: since } } : {}) },
      _count: { _all: true },
    }),
  ]);

  const stats = new Map<string, Record<(typeof TYPES)[number], number>>();
  for (const g of grouped) {
    if (!g.targetId) continue;
    const s = stats.get(g.targetId) ?? { view_pulse: 0, click_pulse_business: 0, click_pulse_source: 0 };
    s[g.type as (typeof TYPES)[number]] += g._count._all;
    stats.set(g.targetId, s);
  }
  const pulses = stats.size ? await db.communityPulse.findMany({ where: { id: { in: [...stats.keys()] } }, select: { id: true, title: true, status: true, deletedAt: true } }) : [];
  const rows = pulses
    .map((p) => ({ ...p, ...stats.get(p.id)! }))
    .sort((a, b) => b.view_pulse - a.view_pulse || b.click_pulse_business - a.click_pulse_business);
  const totals = rows.reduce((t, r) => ({ views: t.views + r.view_pulse, biz: t.biz + r.click_pulse_business, src: t.src + r.click_pulse_source }), { views: 0, biz: 0, src: 0 });

  return (
    <>
      <PageHeader title="Community Pulse analytics" description="Real visits and clicks recorded on public Community Pulse pages. Views count once per visitor per day; no personal data is stored." back={{ href: "/admin/community-pulse/", label: "Community Pulse" }} />
      <LinkTabs items={RANGES.map((r) => ({ label: r.label, href: `/admin/community-pulse/analytics/${r.key === "30" ? "" : `?range=${r.key}`}`, active: r.key === range.key }))} />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Published entries", publishedCount],
          ["Page views", totals.views],
          ["Business profile clicks", totals.biz],
          ["Source discussion clicks", totals.src],
        ].map(([label, n]) => (
          <div key={label as string} className="card p-4">
            <p className="text-xs font-medium text-slate-500">{label as string}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-navy-950">{(n as number).toLocaleString("en-US")}</p>
          </div>
        ))}
      </div>
      <Card title="Most viewed" bodyClassName="p-0">
        {rows.length === 0 ? (
          <div className="p-5"><EmptyState icon={BarChart3} title="No activity recorded yet">Views and clicks appear here once people visit published Community Pulse pages.</EmptyState></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr><th>Entry</th><th className="text-right">Views</th><th className="text-right">Profile clicks</th><th className="text-right">Source clicks</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="min-w-[220px]">
                      <Link href={`/admin/community-pulse/${r.id}/`} className="font-medium text-slate-900 hover:text-brand-700">{r.title}</Link>
                      <span className="ml-2"><StatusBadge status={r.deletedAt ? "DELETED" : r.status} /></span>
                    </td>
                    <td className="text-right tabular-nums">{r.view_pulse.toLocaleString("en-US")}</td>
                    <td className="text-right tabular-nums">{r.click_pulse_business.toLocaleString("en-US")}</td>
                    <td className="text-right tabular-nums">{r.click_pulse_source.toLocaleString("en-US")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

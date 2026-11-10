import Link from "next/link";
import { BarChart3, Download } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { ANALYTICS_RANGES, analyticsRange, getCommunityAnalytics, type CountRow, type NamedRow } from "@/lib/analytics";
import { PageHeader, Card } from "@/components/admin/page-header";
import { LinkTabs } from "@/components/admin/tabs";
import { formatDate } from "@/lib/utils";
import { startOfNyDay } from "@/components/public/dates";
import { spGet, type SP } from "../_lib/list";

export const dynamic = "force-dynamic";
export const metadata = { title: "Community analytics" };

const n = (v: number) => v.toLocaleString("en-US");

function Empty({ children = "Nothing recorded in this period yet." }: { children?: React.ReactNode }) {
  return <p className="py-4 text-center text-sm text-slate-500">{children}</p>;
}

/** Label/count rows with a thin proportional bar (single series; the number is always shown). */
function CountList({ rows, empty, hideZero }: { rows: (CountRow | NamedRow)[]; empty?: React.ReactNode; hideZero?: boolean }) {
  const shown = hideZero ? rows.filter((r) => r.count > 0) : rows;
  if (!shown.length || shown.every((r) => r.count === 0)) return <Empty>{empty}</Empty>;
  const max = Math.max(...shown.map((r) => r.count), 1);
  return (
    <ul className="space-y-2.5">
      {shown.map((r) => {
        const label = "name" in r ? r.name : r.label;
        return (
          <li key={"id" in r ? r.id : r.label} className="text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-slate-700" title={label}>
                {label}
                {"note" in r && r.note ? <span className="ml-1 text-xs text-slate-400">({r.note})</span> : null}
              </span>
              <span className="shrink-0 font-semibold tabular-nums text-navy-950">{n(r.count)}</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-slate-100" aria-hidden>
              <div className="h-1.5 rounded-full bg-navy-700" style={{ width: `${(r.count / max) * 100}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default async function CommunityAnalyticsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireStaff();
  const sp = await searchParams;
  const range = analyticsRange(spGet(sp, "range"));
  const a = await getCommunityAnalytics(range);

  const visitsTotal = a.visits.new + a.visits.returning;
  const returningPct = visitsTotal ? Math.round((a.visits.returning / visitsTotal) * 100) : null;
  const totalSaves = a.savesByType.reduce((s, r) => s + r.count, 0);
  const maxDaily = Math.max(...a.daily.map((d) => d.visitors), 0);
  const dailyEmpty = a.daily.every((d) => d.events === 0);
  const peak = a.daily.reduce((p, d) => (d.visitors > p.visitors ? d : p), a.daily[0]);
  const dayLabel = (k: string) => formatDate(startOfNyDay(k), { month: "short", day: "numeric" });
  const exportHref = `/admin/analytics/export/?range=${range.key}`;

  return (
    <>
      <PageHeader
        title="Community analytics"
        description="Which community features residents actually use. Aggregate counts of real actions only: no names, emails, IP addresses or cross-day tracking, and nothing is sent when a browser asks not to be tracked."
        actions={<a href={exportHref} className="btn-secondary btn-sm" download><Download className="h-4 w-4" aria-hidden /> Export CSV</a>}
      />
      <LinkTabs items={ANALYTICS_RANGES.map((r) => ({ label: r.label, href: `/admin/analytics/${r.key === "30" ? "" : `?range=${r.key}`}`, active: r.key === range.key }))} />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="analytics-tiles">
        {[
          { label: "Recorded actions", value: n(a.total), hint: "views, clicks, saves, searches" },
          { label: "Returning visits", value: returningPct === null ? "—" : `${returningPct}%`, hint: visitsTotal ? `of ${n(visitsTotal)} daily visits · device-based estimate` : "device-based estimate · no data yet" },
          { label: "Saves", value: n(totalSaves), hint: "guest and member saves" },
          { label: "Searches", value: n(a.searches.total), hint: a.searches.total ? `${n(a.searches.noResults)} found nothing` : undefined },
        ].map((t) => (
          <div key={t.label} className="card p-3.5 sm:p-4">
            <p className="text-[13px] font-medium text-slate-500">{t.label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-navy-950">{t.value}</p>
            {t.hint && <p className="mt-0.5 text-xs text-slate-500">{t.hint}</p>}
          </div>
        ))}
      </div>

      <Card title="Visitors per day" description="Estimated unique visitors each day (same network and browser on the same day count once). Hover or tap a bar for the day’s total actions." className="mb-6">
        {dailyEmpty ? (
          <Empty />
        ) : (
          <figure>
            <div className="flex h-32 items-end gap-[2px]" role="img" aria-label={`Visitors per day, ${range.label.toLowerCase()}. Peak ${n(peak.visitors)} on ${dayLabel(peak.day)}.`}>
              {a.daily.map((d) => (
                <div key={d.day} className="group relative flex h-full min-w-0 flex-1 items-end" title={`${dayLabel(d.day)}: ${n(d.visitors)} visitors (estimate), ${n(d.events)} actions`}>
                  <div className="w-full rounded-t-[4px] bg-navy-700 group-hover:bg-sunset-500" style={{ height: maxDaily ? `${Math.max((d.visitors / maxDaily) * 100, d.visitors ? 3 : 0)}%` : 0 }} />
                </div>
              ))}
            </div>
            <figcaption className="mt-2 flex justify-between text-xs text-slate-500">
              <span>{dayLabel(a.daily[0].day)}</span>
              <span>Peak {n(peak.visitors)} on {dayLabel(peak.day)}</span>
              <span>{dayLabel(a.daily[a.daily.length - 1].day)}</span>
            </figcaption>
          </figure>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <Card title="Feature usage" description="Each number counts recorded actions. Page views count once per visitor per day.">
          <CountList rows={a.features} />
        </Card>

        <div className="space-y-6">
          <Card title="Events list by quick date" description="Which date views residents open (Today, This weekend, …)">
            <CountList rows={a.eventsViews} hideZero />
          </Card>
          <Card title="New vs returning visits" description="Device-based estimate: a date flag stored only in the browser, not an identifier. Clearing site data or switching devices counts as new.">
            {visitsTotal ? (
              <CountList rows={[{ label: "Returning (seen on an earlier day)", count: a.visits.returning }, { label: "New on this device", count: a.visits.new }]} />
            ) : <Empty />}
          </Card>
          <Card title="App installs and launches" description="Only measurable on supporting browsers; undercounts. iPhone/iPad never report installs.">
            <CountList rows={a.pwa} />
          </Card>
        </div>

        <Card title="Top events" description="Event page views">
          <CountList rows={a.topEvents} />
        </Card>

        <Card title="Top businesses" description="Profile views and outbound actions" bodyClassName="p-0">
          {a.businesses.length ? (
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead><tr><th>Business</th><th className="text-right">Views</th><th className="text-right">Web</th><th className="text-right">Phone</th><th className="text-right">Dir.</th></tr></thead>
                <tbody>
                  {a.businesses.map((b) => (
                    <tr key={b.id}>
                      <td className="max-w-[10rem] truncate sm:max-w-xs" title={b.name}>{b.name}</td>
                      <td className="text-right tabular-nums">{n(b.views)}</td>
                      <td className="text-right tabular-nums">{n(b.website)}</td>
                      <td className="text-right tabular-nums">{n(b.phone)}</td>
                      <td className="text-right tabular-nums">{n(b.directions)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className="p-4 sm:p-5"><Empty /></div>}
        </Card>

        <Card title="Top garage sales" description="Sale page views">
          <CountList rows={a.topSales} />
        </Card>
        <Card title="Top food trucks" description="Directions clicks from the Food Trucks schedule">
          <CountList rows={a.topTrucks} />
        </Card>

        <Card title="Saves by content type">
          <CountList rows={a.savesByType} />
        </Card>
        <Card title="Most saved">
          <CountList rows={a.mostSaved.map((r) => ({ id: `${r.kind}:${r.id}`, name: `${r.name} · ${r.kind}`, count: r.count }))} />
        </Card>

        <Card title="Communities" description="Community page views and “My community” choices, by town" bodyClassName="p-0">
          {a.communities.length ? (
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead><tr><th>Community</th><th className="text-right">Page views</th><th className="text-right">Chosen</th></tr></thead>
                <tbody>
                  {a.communities.map((c) => (
                    <tr key={c.name}><td>{c.name}</td><td className="text-right tabular-nums">{n(c.views)}</td><td className="text-right tabular-nums">{n(c.choices)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className="p-4 sm:p-5"><Empty /></div>}
        </Card>
        <Card title="Explore collections" description="Collection page views">
          <CountList rows={a.collections} />
        </Card>
      </div>

      <div className="mt-6 flex gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
        <BarChart3 className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" aria-hidden />
        <div className="space-y-1">
          <p>All numbers are counts of recorded actions in the selected period (New York days, today included). Unique visitors are approximated per day only: the same network and browser on one day count once, and the same person on two days counts twice. We never track anyone across days.</p>
          <p>Visitors with Global Privacy Control or Do Not Track turned on, ad blockers, and known bots are not counted, so real use is higher than shown. Pulse-specific numbers are in <Link href="/admin/community-pulse/analytics/" className="font-semibold text-brand-700 hover:underline">Community Pulse analytics</Link>.</p>
        </div>
      </div>
    </>
  );
}

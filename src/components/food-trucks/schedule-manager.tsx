import { CalendarClock, CheckCircle2, Repeat, Truck } from "lucide-react";
import { db } from "@/lib/db";
import { formatDate, toDateInput } from "@/lib/utils";
import { canConfirm, groupByDay, lastScheduleUpdates, nyDateKey, nyMidnight, shortTime, timeRange } from "@/lib/food-trucks";
import { EmptyState } from "@/components/ui/empty-state";
import { EditStop, SeriesForm, StopForm, StopOpButton } from "./schedule-forms";

/**
 * Owner/staff schedule manager for one food truck (server component).
 * Used by /dashboard/[businessId]/schedule/ and /admin/food-trucks/[id]/.
 */
export async function ScheduleManager({ business }: { business: { id: string; updatedAt: Date } }) {
  const now = new Date();
  const todayStart = nyMidnight(nyDateKey(now));
  const [stops, last] = await Promise.all([
    db.foodTruckStop.findMany({ where: { businessId: business.id, endAt: { gte: todayStart } }, orderBy: [{ startAt: "asc" }, { id: "asc" }], take: 300 }),
    lastScheduleUpdates([business]),
  ]);
  const groups = groupByDay(stops, now);
  const updated = last.get(business.id);

  return (
    <div className="space-y-6">
      <section className="card p-5 sm:p-6" aria-labelledby="stops-title">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 id="stops-title" className="text-lg font-semibold text-navy-900">Upcoming stops</h2>
          {updated && <p className="text-sm text-slate-500">Schedule last updated {formatDate(updated, { month: "short", day: "numeric", year: "numeric" })}</p>}
        </div>
        {groups.length === 0 ? (
          <div className="mt-4"><EmptyState icon={Truck} title="No upcoming stops yet">Add a stop below, or set up a weekly schedule so neighbors know where to find you.</EmptyState></div>
        ) : (
          <div className="mt-4 space-y-6">
            {groups.map((g) => (
              <div key={g.key}>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{g.label}</h3>
                <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200">
                  {g.items.map((s) => {
                    const ended = s.endAt <= now;
                    const cancelled = s.status === "CANCELLED";
                    const values = {
                      date: toDateInput(s.startAt).slice(0, 10), startTime: toDateInput(s.startAt).slice(11), endTime: toDateInput(s.endAt).slice(11),
                      locationName: s.locationName, address: s.address ?? "", city: s.city ?? "", notes: s.notes ?? "",
                    };
                    return (
                      <li key={s.id} className={cnRow(cancelled || ended)} data-testid="owner-stop" data-stop-id={s.id}>
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-semibold text-navy-900">{timeRange(s.startAt, s.endAt)} · {s.locationName}</p>
                            {(s.address || s.city) && <p className="text-sm text-slate-600">{[s.address, s.city].filter(Boolean).join(", ")}</p>}
                            {s.notes && <p className="mt-1 text-sm text-slate-600">{s.notes}</p>}
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {s.seriesId && <span className="badge-gray"><Repeat className="h-3 w-3" aria-hidden /> Weekly</span>}
                            {cancelled ? <span className="badge-red">Cancelled</span>
                              : ended ? <span className="badge-gray">Ended</span>
                              : s.confirmedAt ? <span className="badge-green"><CheckCircle2 className="h-3 w-3" aria-hidden /> Confirmed {shortTime(s.confirmedAt)}</span>
                              : <span className="badge-blue"><CalendarClock className="h-3 w-3" aria-hidden /> Scheduled</span>}
                          </div>
                        </div>
                        {!ended && (
                          <div className="mt-3 flex flex-wrap items-start gap-2">
                            {!cancelled && canConfirm(s, now) && !s.confirmedAt && (
                              <StopOpButton businessId={business.id} stopId={s.id} op="confirm" className="btn-primary btn-sm">Confirm we&apos;re serving</StopOpButton>
                            )}
                            {!cancelled && s.confirmedAt && <StopOpButton businessId={business.id} stopId={s.id} op="unconfirm" className="btn-secondary btn-sm">Undo confirmation</StopOpButton>}
                            {!cancelled && <StopOpButton businessId={business.id} stopId={s.id} op="cancel" className="btn-ghost btn-sm text-red-600 hover:bg-red-50" confirmText="Cancel this stop?">Cancel stop</StopOpButton>}
                            {!cancelled && s.seriesId && <StopOpButton businessId={business.id} stopId={s.id} op="cancelSeries" className="btn-ghost btn-sm text-red-600 hover:bg-red-50" confirmText="Cancel this and all later stops in this weekly schedule?">Cancel rest of series</StopOpButton>}
                            {cancelled && <StopOpButton businessId={business.id} stopId={s.id} op="restore" className="btn-secondary btn-sm">Restore stop</StopOpButton>}
                            {!cancelled && <EditStop businessId={business.id} stopId={s.id} values={values} />}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
        <p className="mt-4 text-xs text-slate-500">Cancelled stops stay here for you but are hidden from the public. Confirm a stop on the day you&apos;re serving so neighbors see “Confirmed by the truck”.</p>
      </section>

      <section className="card p-5 sm:p-6" aria-labelledby="add-stop-title">
        <h2 id="add-stop-title" className="text-lg font-semibold text-navy-900">Add a stop</h2>
        <p className="mt-1 text-sm text-slate-600">Times are Eastern Time. If the end time is earlier than the start time, the stop runs past midnight.</p>
        <div className="mt-4"><StopForm businessId={business.id} /></div>
      </section>

      <section className="card p-5 sm:p-6" aria-labelledby="series-title">
        <h2 id="series-title" className="text-lg font-semibold text-navy-900">Add a weekly schedule</h2>
        <p className="mt-1 text-sm text-slate-600">Same place, same time, every week? Pick the days and we&apos;ll add each stop (up to 12 weeks, 60 stops at a time). You can still edit or cancel any single stop.</p>
        <div className="mt-4"><SeriesForm businessId={business.id} defaultFrom={nyDateKey(now)} /></div>
      </section>
    </div>
  );
}

function cnRow(muted: boolean) {
  return muted ? "bg-slate-50 p-4 text-slate-500" : "p-4";
}

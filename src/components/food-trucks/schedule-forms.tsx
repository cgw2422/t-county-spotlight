"use client";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { TUSCARAWAS_CITIES, cn } from "@/lib/utils";
import { createSeriesAction, saveStopAction, stopOpAction } from "@/app/dashboard/[businessId]/schedule/actions";
import type { FormState } from "@/components/dashboard/fields";

export type StopValues = { date: string; startTime: string; endTime: string; locationName: string; address: string; city: string; notes: string };

const WEEKDAYS = [["1", "Mon"], ["2", "Tue"], ["3", "Wed"], ["4", "Thu"], ["5", "Fri"], ["6", "Sat"], ["0", "Sun"]] as const;

function v(state: FormState, name: string, fallback: string) {
  const x = state?.values?.[name];
  return typeof x === "string" ? x : fallback;
}

function Field({ label, error, hint, optional, children, id }: { label: string; error?: string; hint?: string; optional?: boolean; children: React.ReactNode; id: string }) {
  return (
    <div>
      <label htmlFor={id} className="label">{label}{optional && <span className="font-normal text-slate-400"> (optional)</span>}</label>
      {children}
      {(error || hint) && <p className={error ? "mt-1 text-sm text-red-600" : "help text-sm"}>{error || hint}</p>}
    </div>
  );
}

function CityField({ defaultValue, error }: { defaultValue: string; error?: string }) {
  const id = useId();
  const known = !defaultValue || TUSCARAWAS_CITIES.includes(defaultValue);
  const [val, setVal] = useState(known ? defaultValue : "__other");
  return (
    <Field label="Community" id={id} error={error} optional>
      <select id={id} name="city" className="input" value={val} onChange={(e) => setVal(e.target.value)}>
        <option value="">Select a community…</option>
        {TUSCARAWAS_CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
        <option value="__other">Other…</option>
      </select>
      {val === "__other" && <input name="cityOther" className="input mt-2" defaultValue={known ? "" : defaultValue} placeholder="Community name" aria-label="Other community" maxLength={80} />}
    </Field>
  );
}

function PlaceFields({ state, values }: { state: FormState; values?: Partial<StopValues> }) {
  const id = useId();
  const fe = state?.fieldErrors ?? {};
  return (
    <>
      <Field label="Location name" id={`${id}-loc`} error={fe.locationName} hint="For example “Tuscora Park” or “Dover Walmart parking lot”.">
        <input id={`${id}-loc`} name="locationName" required maxLength={120} className={cn("input", fe.locationName && "border-red-400")} defaultValue={v(state, "locationName", values?.locationName ?? "")} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Street address" id={`${id}-addr`} error={fe.address} optional hint="Used for the directions link.">
          <input id={`${id}-addr`} name="address" maxLength={200} className="input" autoComplete="street-address" defaultValue={v(state, "address", values?.address ?? "")} />
        </Field>
        <CityField key={state?.values ? `e-${v(state, "city", "")}` : "orig"} defaultValue={v(state, "city", values?.city ?? "")} error={fe.city} />
      </div>
      <Field label="Notes" id={`${id}-notes`} error={fe.notes} optional hint="Anything people should know: specials, payment, parking.">
        <textarea id={`${id}-notes`} name="notes" maxLength={500} rows={2} className="input" defaultValue={v(state, "notes", values?.notes ?? "")} />
      </Field>
    </>
  );
}

/** Add one stop, or edit an existing one (pass stopId + values). */
export function StopForm({ businessId, stopId, values, submitLabel = "Add stop", onDone }: { businessId: string; stopId?: string; values?: Partial<StopValues>; submitLabel?: string; onDone?: () => void }) {
  const [state, action] = useActionState(saveStopAction, null);
  const id = useId();
  const fe = state?.fieldErrors ?? {};
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) { if (!stopId) formRef.current?.reset(); onDone?.(); }
  }, [state, stopId, onDone]);
  return (
    <form ref={formRef} action={action} className="space-y-4" data-testid={stopId ? "edit-stop-form" : "add-stop-form"}>
      <input type="hidden" name="businessId" value={businessId} />
      {stopId && <input type="hidden" name="stopId" value={stopId} />}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Date" id={`${id}-date`} error={fe.date}>
          <input id={`${id}-date`} type="date" name="date" required className={cn("input", fe.date && "border-red-400")} defaultValue={v(state, "date", values?.date ?? "")} />
        </Field>
        <Field label="Start time" id={`${id}-st`} error={fe.startTime}>
          <input id={`${id}-st`} type="time" name="startTime" required className={cn("input", fe.startTime && "border-red-400")} defaultValue={v(state, "startTime", values?.startTime ?? "11:00")} />
        </Field>
        <Field label="End time" id={`${id}-et`} error={fe.endTime}>
          <input id={`${id}-et`} type="time" name="endTime" required className={cn("input", fe.endTime && "border-red-400")} defaultValue={v(state, "endTime", values?.endTime ?? "14:00")} />
        </Field>
      </div>
      <PlaceFields state={state} values={values} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SubmitButton className="btn-primary" pendingText="Saving…">{submitLabel}</SubmitButton>
        <div className="flex-1"><FormMessage state={state} /></div>
      </div>
    </form>
  );
}

/** Weekly recurring schedule → creates individual stops sharing a series id. */
export function SeriesForm({ businessId, defaultFrom }: { businessId: string; defaultFrom: string }) {
  const [state, action] = useActionState(createSeriesAction, null);
  const id = useId();
  const fe = state?.fieldErrors ?? {};
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) formRef.current?.reset(); }, [state]);
  const echoedDays = state?.values?.weekdays;
  const dayChecked = (d: string) => (echoedDays === undefined ? false : Array.isArray(echoedDays) ? echoedDays.includes(d) : echoedDays === d);
  return (
    <form ref={formRef} action={action} className="space-y-4" data-testid="series-form">
      <input type="hidden" name="businessId" value={businessId} />
      <fieldset>
        <legend className="label">Days of the week</legend>
        <div className="flex flex-wrap gap-2">
          {WEEKDAYS.map(([val, label]) => (
            <label key={val} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50">
              <input type="checkbox" name="weekdays" value={val} defaultChecked={dayChecked(val)} className="h-4 w-4" /> {label}
            </label>
          ))}
        </div>
        {fe.weekdays && <p className="mt-1 text-sm text-red-600">{fe.weekdays}</p>}
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-4">
        <Field label="Starting from" id={`${id}-from`} error={fe.fromDate}>
          <input id={`${id}-from`} type="date" name="fromDate" required className="input" defaultValue={v(state, "fromDate", defaultFrom)} />
        </Field>
        <Field label="For how many weeks" id={`${id}-weeks`} error={fe.weeks}>
          <select id={`${id}-weeks`} name="weeks" className="input" defaultValue={v(state, "weeks", "4")}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n} week{n === 1 ? "" : "s"}</option>)}
          </select>
        </Field>
        <Field label="Start time" id={`${id}-st`} error={fe.startTime}>
          <input id={`${id}-st`} type="time" name="startTime" required className="input" defaultValue={v(state, "startTime", "11:00")} />
        </Field>
        <Field label="End time" id={`${id}-et`} error={fe.endTime}>
          <input id={`${id}-et`} type="time" name="endTime" required className="input" defaultValue={v(state, "endTime", "14:00")} />
        </Field>
      </div>
      <PlaceFields state={state} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SubmitButton className="btn-primary" pendingText="Adding…">Add weekly stops</SubmitButton>
        <div className="flex-1"><FormMessage state={state} /></div>
      </div>
    </form>
  );
}

type Op = "cancel" | "restore" | "confirm" | "unconfirm" | "cancelSeries";

/** One-click stop action (confirm, undo, cancel…), with an inline "are you sure?" for cancellations. */
export function StopOpButton({ businessId, stopId, op, children, className, confirmText }: { businessId: string; stopId: string; op: Op; children: React.ReactNode; className?: string; confirmText?: string }) {
  const [state, action] = useActionState(stopOpAction, null);
  const [asking, setAsking] = useState(false);
  const hidden = (
    <>
      <input type="hidden" name="businessId" value={businessId} />
      <input type="hidden" name="stopId" value={stopId} />
      <input type="hidden" name="op" value={op} />
    </>
  );
  return (
    <div className="inline-flex flex-col gap-1">
      {confirmText && !asking ? (
        <button type="button" className={className} onClick={() => setAsking(true)}>{children}</button>
      ) : (
        <form action={action} className="inline-flex flex-wrap items-center gap-2">
          {hidden}
          {confirmText && <span className="text-sm text-slate-700">{confirmText}</span>}
          <SubmitButton className={confirmText ? "btn-danger btn-sm" : className} pendingText="Saving…">{confirmText ? "Yes" : children}</SubmitButton>
          {confirmText && <button type="button" className="btn-ghost btn-sm" onClick={() => setAsking(false)}>Keep</button>}
        </form>
      )}
      {state?.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
    </div>
  );
}

/** Collapsible edit form for one stop. */
export function EditStop({ businessId, stopId, values }: { businessId: string; stopId: string; values: StopValues }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="w-full">
      {!open ? (
        <button type="button" className="btn-secondary btn-sm" onClick={() => setOpen(true)}>Edit</button>
      ) : (
        <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 flex items-center justify-between"><p className="font-semibold text-navy-900">Edit stop</p><button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(false)}>Close</button></div>
          <StopForm businessId={businessId} stopId={stopId} values={values} submitLabel="Save stop" />
        </div>
      )}
    </div>
  );
}

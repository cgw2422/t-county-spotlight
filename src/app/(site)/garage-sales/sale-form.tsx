"use client";
import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ImagePlus, Loader2, X } from "lucide-react";
import { FormMessage, type ActionState } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { GARAGE_SALE_CATEGORIES, GARAGE_SALE_LIMITS, GARAGE_SALE_TYPES } from "@/lib/garage-sales-shared";

export type SaleFormValues = {
  title: string; saleType: string; description: string; itemCategories: string[]; startDate: string; endDate: string;
  dailyStart: string; dailyEnd: string; address: string; city: string; zip: string; addressVisibility: "EXACT" | "GENERAL";
  generalLocation: string; photos: string[]; name: string; email: string;
};

type Props = {
  mode: "create" | "edit";
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  defaults?: Partial<SaleFormValues>;
  hidden?: Record<string, string>;
  cities: readonly string[];
  minDate: string;
  maxDate: string;
  stamp?: { t: string; sig: string };
};

function Err({ state, name }: { state: ActionState; name: string }) {
  const m = state?.fieldErrors?.[name];
  return m ? <p id={`${name}-err`} className="mt-1 text-sm text-red-600">{m}</p> : null;
}

function PhotoField({ initial }: { initial: string[] }) {
  const [photos, setPhotos] = useState<string[]>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formKey] = useState(() => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}-key`));
  const input = useRef<HTMLInputElement>(null);
  const full = photos.length >= GARAGE_SALE_LIMITS.maxPhotos;

  async function upload(files: File[]) {
    setError(null);
    let current = photos.length;
    for (const file of files) {
      if (current >= GARAGE_SALE_LIMITS.maxPhotos) { setError(`You can add up to ${GARAGE_SALE_LIMITS.maxPhotos} photos.`); break; }
      if (file.size > GARAGE_SALE_LIMITS.maxPhotoBytes) { setError(`“${file.name}” is larger than 8 MB.`); continue; }
      setBusy(true);
      const fd = new FormData();
      fd.append("file", file);
      fd.append("formKey", formKey);
      fd.append("count", String(current));
      try {
        const res = await fetch("/api/garage-sales/upload/", { method: "POST", body: fd });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || "Upload failed");
        current++;
        setPhotos((p) => [...p, json.url]);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    }
  }

  return (
    <div>
      <span className="label">Photos (optional, up to {GARAGE_SALE_LIMITS.maxPhotos})</span>
      {photos.map((p) => <input key={p} type="hidden" name="photos" value={p} />)}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {photos.map((p, i) => (
          <li key={p} className="relative aspect-square overflow-hidden rounded-xl bg-slate-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
            <button type="button" onClick={() => setPhotos((all) => all.filter((x) => x !== p))} className="absolute right-1.5 top-1.5 grid h-9 w-9 place-items-center rounded-full bg-white/95 shadow hover:bg-white" aria-label={`Remove photo ${i + 1}`}><X className="h-4 w-4" /></button>
          </li>
        ))}
        {!full && (
          <li>
            <button type="button" onClick={() => input.current?.click()} disabled={busy} className="flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-3 text-sm text-slate-600 hover:bg-slate-100">
              {busy ? <Loader2 className="h-6 w-6 animate-spin" aria-hidden /> : <ImagePlus className="h-6 w-6" aria-hidden />}
              {busy ? "Uploading…" : "Add photo"}
            </button>
          </li>
        )}
      </ul>
      <input ref={input} data-testid="photo-input" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple className="sr-only" tabIndex={-1}
        onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ""; if (f.length) upload(f); }} />
      {error ? <p role="alert" className="mt-2 text-sm text-red-600">{error}</p> : <p className="help">JPG, PNG, WebP or GIF, 8 MB max each. Please don&apos;t include house numbers or people&apos;s faces.</p>}
    </div>
  );
}

export function GarageSaleForm({ mode, action, defaults = {}, hidden = {}, cities, minDate, maxDate, stamp }: Props) {
  const [state, formAction] = useActionState(action, null);
  const [visibility, setVisibility] = useState<"EXACT" | "GENERAL">(defaults.addressVisibility ?? "GENERAL");
  const inv = (n: string) => (state?.fieldErrors?.[n] ? { "aria-invalid": true, "aria-describedby": `${n}-err` } : {});
  const cats = new Set(defaults.itemCategories ?? []);

  if (state?.ok && mode === "create") {
    return (
      <div role="status" className="card p-8 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-hillside-600" aria-hidden />
        <h2 className="mt-4 font-display text-2xl font-semibold text-navy-900">Thank you!</h2>
        <p className="mx-auto mt-2 max-w-md text-slate-600">{state.message}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/garage-sales/" className="btn-primary">Browse garage sales</Link>
          <button type="button" onClick={() => window.location.reload()} className="btn-secondary">List another sale</button>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-8" noValidate>
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {stamp && <><input type="hidden" name="t" value={stamp.t} /><input type="hidden" name="sig" value={stamp.sig} /></>}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="website_url">Leave this empty</label>
        <input id="website_url" name="website_url" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <fieldset className="card space-y-5 p-5 sm:p-6">
        <legend className="sr-only">The sale</legend>
        <h2 className="font-display text-xl font-semibold text-navy-900">The sale</h2>
        <div>
          <label htmlFor="title" className="label">Title <span className="text-red-600">*</span></label>
          <input id="title" name="title" required maxLength={120} defaultValue={defaults.title} className="input" placeholder="e.g. Big multi-family sale — kids' clothes & tools" {...inv("title")} />
          <Err state={state} name="title" />
        </div>
        <div>
          <label htmlFor="saleType" className="label">Kind of sale <span className="text-red-600">*</span></label>
          <select id="saleType" name="saleType" className="input" defaultValue={defaults.saleType ?? "GARAGE"} {...inv("saleType")}>
            {GARAGE_SALE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <Err state={state} name="saleType" />
        </div>
        <div>
          <label htmlFor="description" className="label">Description</label>
          <textarea id="description" name="description" rows={4} maxLength={2000} defaultValue={defaults.description} className="input" placeholder="Highlights, cash only, rain date…" {...inv("description")} />
          <Err state={state} name="description" />
        </div>
        <fieldset>
          <legend className="label">What you&apos;re selling</legend>
          <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2 lg:grid-cols-3">
            {GARAGE_SALE_CATEGORIES.map((c) => (
              <label key={c.key} className="flex min-h-11 items-center gap-3 text-sm text-slate-700">
                <input type="checkbox" name="itemCategories" value={c.key} defaultChecked={cats.has(c.key)} className="h-5 w-5 rounded border-slate-300" /> {c.label}
              </label>
            ))}
          </div>
        </fieldset>
        <PhotoField initial={defaults.photos ?? []} />
        <Err state={state} name="photos" />
      </fieldset>

      <fieldset className="card space-y-5 p-5 sm:p-6">
        <legend className="sr-only">Dates and hours</legend>
        <h2 className="font-display text-xl font-semibold text-navy-900">Dates &amp; hours</h2>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="startDate" className="label">First day <span className="text-red-600">*</span></label>
            <input id="startDate" name="startDate" type="date" min={minDate} max={maxDate} required defaultValue={defaults.startDate} className="input" {...inv("startDate")} />
            <Err state={state} name="startDate" />
          </div>
          <div>
            <label htmlFor="endDate" className="label">Last day</label>
            <input id="endDate" name="endDate" type="date" min={minDate} defaultValue={defaults.endDate} className="input" {...inv("endDate")} />
            <Err state={state} name="endDate" />
            <p className="help">Leave blank for a one-day sale. Up to {GARAGE_SALE_LIMITS.maxSpanDays} days.</p>
          </div>
          <div>
            <label htmlFor="dailyStart" className="label">Opens each day at <span className="text-red-600">*</span></label>
            <input id="dailyStart" name="dailyStart" type="time" required defaultValue={defaults.dailyStart ?? "08:00"} className="input" {...inv("dailyStart")} />
            <Err state={state} name="dailyStart" />
          </div>
          <div>
            <label htmlFor="dailyEnd" className="label">Closes each day at <span className="text-red-600">*</span></label>
            <input id="dailyEnd" name="dailyEnd" type="time" required defaultValue={defaults.dailyEnd ?? "14:00"} className="input" {...inv("dailyEnd")} />
            <Err state={state} name="dailyEnd" />
          </div>
        </div>
        <p className="help">Times are Eastern (Ohio) time. Sales come down automatically after the last day.</p>
      </fieldset>

      <fieldset className="card space-y-5 p-5 sm:p-6">
        <legend className="sr-only">Location</legend>
        <h2 className="font-display text-xl font-semibold text-navy-900">Location</h2>
        <div>
          <label htmlFor="address" className="label">Street address <span className="text-red-600">*</span></label>
          <input id="address" name="address" required maxLength={200} autoComplete="street-address" defaultValue={defaults.address} className="input" {...inv("address")} />
          <Err state={state} name="address" />
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-[minmax(0,1fr)_10rem]">
          <div>
            <label htmlFor="city" className="label">Town <span className="text-red-600">*</span></label>
            <input id="city" name="city" list="gs-city-list" required maxLength={80} defaultValue={defaults.city} className="input" {...inv("city")} />
            <datalist id="gs-city-list">{cities.map((c) => <option key={c} value={c} />)}</datalist>
            <Err state={state} name="city" />
          </div>
          <div>
            <label htmlFor="zip" className="label">ZIP <span className="text-red-600">*</span></label>
            <input id="zip" name="zip" required inputMode="numeric" pattern="\d{5}" maxLength={5} autoComplete="postal-code" defaultValue={defaults.zip} className="input" {...inv("zip")} />
            <Err state={state} name="zip" />
          </div>
        </div>
        <fieldset>
          <legend className="label">What should we show publicly?</legend>
          <div className="space-y-2">
            <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3 text-sm has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50">
              <input type="radio" name="addressVisibility" value="EXACT" checked={visibility === "EXACT"} onChange={() => setVisibility("EXACT")} className="mt-0.5 h-5 w-5" />
              <span><span className="block font-semibold text-navy-900">Show my exact address</span><span className="text-slate-600">Shoppers see your street address and get turn-by-turn directions.</span></span>
            </label>
            <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3 text-sm has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50">
              <input type="radio" name="addressVisibility" value="GENERAL" checked={visibility === "GENERAL"} onChange={() => setVisibility("GENERAL")} className="mt-0.5 h-5 w-5" />
              <span><span className="block font-semibold text-navy-900">Show a general location only</span><span className="text-slate-600">We show only the area you describe and your town. Your street address stays private.</span></span>
            </label>
          </div>
        </fieldset>
        {visibility === "GENERAL" && (
          <div>
            <label htmlFor="generalLocation" className="label">General location <span className="text-red-600">*</span></label>
            <input id="generalLocation" name="generalLocation" maxLength={120} defaultValue={defaults.generalLocation} className="input" placeholder="e.g. Near Front Ave & 3rd St" {...inv("generalLocation")} />
            <Err state={state} name="generalLocation" />
            <p className="help">Cross streets, a neighborhood or a landmark. Directions will point here.</p>
          </div>
        )}
      </fieldset>

      <fieldset className="card space-y-5 p-5 sm:p-6">
        <legend className="sr-only">Your contact</legend>
        <h2 className="font-display text-xl font-semibold text-navy-900">Your contact info</h2>
        <p className="text-sm text-slate-600">Kept private. We only use it to send your manage link and questions about this listing — it&apos;s never shown on the site.</p>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="name" className="label">Your name</label>
            <input id="name" name="name" maxLength={100} autoComplete="name" defaultValue={defaults.name} className="input" />
          </div>
          <div>
            <label htmlFor="email" className="label">Email <span className="text-red-600">*</span></label>
            <input id="email" name="email" type="email" required autoComplete="email" defaultValue={defaults.email} className="input" {...inv("email")} />
            <Err state={state} name="email" />
          </div>
        </div>
        {mode === "create" && (
          <label className="flex min-h-11 items-start gap-3 text-sm text-slate-700">
            <input type="checkbox" name="consent" required className="mt-0.5 h-5 w-5 rounded border-slate-300" {...inv("consent")} />
            <span>This is my sale (or I&apos;m organizing it), the details are accurate, and I agree to have it reviewed and listed on T County Connect.</span>
          </label>
        )}
        <Err state={state} name="consent" />
      </fieldset>

      <FormMessage state={state} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SubmitButton className="btn-primary sm:min-w-48" pendingText={mode === "create" ? "Submitting…" : "Saving…"}>{mode === "create" ? "Submit my sale" : "Save changes"}</SubmitButton>
        <p className="text-sm text-slate-500">{mode === "create" ? "Sales are reviewed before they appear publicly." : "Edits to a published sale are reviewed again before they show."}</p>
      </div>
    </form>
  );
}

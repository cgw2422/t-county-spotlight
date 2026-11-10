"use client";
import { startTransition, useActionState, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2 } from "lucide-react";
import { FormMessage } from "@/components/ui/form-message";
import type { ActionState } from "@/components/ui/form-message";
import { ResidentPhotoField } from "@/components/public/resident-photo-field";
import { COMMUNITIES } from "@/lib/my-t-county-shared";
import { SUGGESTION_KINDS, SUGGESTION_KIND_INFO, SUGGESTION_LIMITS, type SuggestionKindValue } from "@/lib/suggestions-shared";

export type SuggestionFormValues = {
  kind: SuggestionKindValue; title: string; details: string; city: string; address: string; linkUrl: string; eventDate: string; photos: string[]; name: string; email: string;
};

type Props = {
  mode: "create" | "edit";
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  defaults: SuggestionFormValues;
  hidden?: Record<string, string>;
  stamp?: { t: string; sig: string };
  submitLabel?: string;
};

function Err({ state, name }: { state: ActionState; name: string }) {
  const m = state?.fieldErrors?.[name];
  return m ? <p id={`${name}-err`} className="mt-1 text-sm text-red-600">{m}</p> : null;
}

/** One form for every kind of resident suggestion (openings, community updates, attractions, volunteer opportunities). */
export function SuggestionForm({ mode, action, defaults, hidden = {}, stamp, submitLabel }: Props) {
  const [state, formAction, pending] = useActionState(action, null);
  const [kind, setKind] = useState<SuggestionKindValue>(defaults.kind);
  const info = SUGGESTION_KIND_INFO[kind];
  const inv = (n: string) => (state?.fieldErrors?.[n] ? { "aria-invalid": true, "aria-describedby": `${n}-err` } : {});

  if (state?.ok && mode === "create") {
    return (
      <div role="status" className="card p-8 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-hillside-600" aria-hidden />
        <h2 className="mt-4 font-display text-2xl font-semibold text-navy-900">Thank you!</h2>
        <p className="mx-auto mt-2 max-w-md text-slate-600">{state.message}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/submit/" className="btn-primary">Share something else</Link>
          <Link href="/" className="btn-secondary">Back to home</Link>
        </div>
      </div>
    );
  }

  return (
    // Dispatched manually (not via `action`) so React doesn't reset the fields after a validation error.
    <form className="space-y-8" noValidate onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); startTransition(() => formAction(fd)); }}>
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {stamp && <><input type="hidden" name="t" value={stamp.t} /><input type="hidden" name="sig" value={stamp.sig} /></>}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="website_url">Leave this empty</label>
        <input id="website_url" name="website_url" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <fieldset className="card space-y-5 p-5 sm:p-6">
        <legend className="sr-only">Your suggestion</legend>
        <div>
          <label htmlFor="kind" className="label">What are you sharing? <span className="text-red-600">*</span></label>
          <select id="kind" name="kind" className="input" value={kind} onChange={(e) => setKind(e.target.value as SuggestionKindValue)} {...inv("kind")}>
            {SUGGESTION_KINDS.map((k) => <option key={k} value={k}>{SUGGESTION_KIND_INFO[k].label}</option>)}
          </select>
          <Err state={state} name="kind" />
          {kind === "VOLUNTEER" && (
            <p className="mt-2 rounded-lg bg-hillside-50 px-3 py-2 text-sm text-hillside-800">
              Part of a nonprofit, church or community group? <Link href="/gives/register/" className="font-semibold underline">Register for a free T County Gives page</Link> to post opportunities yourself.
            </p>
          )}
        </div>
        <div>
          <label htmlFor="title" className="label">{info.titleLabel} <span className="text-red-600">*</span></label>
          <input id="title" name="title" required maxLength={160} defaultValue={defaults.title} className="input" placeholder={info.titlePlaceholder} {...inv("title")} />
          <Err state={state} name="title" />
        </div>
        <div>
          <label htmlFor="details" className="label">Details <span className="text-red-600">*</span></label>
          <textarea id="details" name="details" rows={5} required maxLength={4000} defaultValue={defaults.details} className="input" placeholder={info.detailsPlaceholder} {...inv("details")} />
          <Err state={state} name="details" />
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="city" className="label">Community</label>
            <select id="city" name="city" defaultValue={defaults.city} className="input" {...inv("city")}>
              <option value="">Not sure / countywide</option>
              {COMMUNITIES.map((c) => <option key={c.slug} value={c.name}>{c.name}</option>)}
            </select>
            <Err state={state} name="city" />
          </div>
          <div>
            <label htmlFor="address" className="label">Address <span className="font-normal text-slate-400">(optional)</span></label>
            <input id="address" name="address" maxLength={200} defaultValue={defaults.address} className="input" {...inv("address")} />
            <Err state={state} name="address" />
          </div>
          <div>
            <label htmlFor="linkUrl" className="label">Link <span className="font-normal text-slate-400">(optional)</span></label>
            <input id="linkUrl" name="linkUrl" type="url" inputMode="url" maxLength={500} defaultValue={defaults.linkUrl} className="input" placeholder="https://" {...inv("linkUrl")} />
            <Err state={state} name="linkUrl" />
            <p className="help">Where you saw it: a website, announcement or post.</p>
          </div>
          <div>
            <label htmlFor="eventDate" className="label">{info.dateLabel} <span className="font-normal text-slate-400">(optional)</span></label>
            <input id="eventDate" name="eventDate" type="date" defaultValue={defaults.eventDate} className="input" {...inv("eventDate")} />
            <Err state={state} name="eventDate" />
            {info.dateHelp && <p className="help">{info.dateHelp}</p>}
          </div>
        </div>
        <ResidentPhotoField initial={defaults.photos} max={SUGGESTION_LIMITS.maxPhotos} purpose="suggestion" help="JPG, PNG, WebP or GIF, 8 MB max each. Only share photos you took or have permission to use." />
        <Err state={state} name="photos" />
      </fieldset>

      <fieldset className="card space-y-5 p-5 sm:p-6">
        <legend className="sr-only">Your contact</legend>
        <h2 className="font-display text-xl font-semibold text-navy-900">Your contact info</h2>
        <p className="text-sm text-slate-600">Kept private. We only use it to send your manage link and to ask questions about this suggestion — it&apos;s never shown on the site.</p>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="name" className="label">Your name <span className="font-normal text-slate-400">(optional)</span></label>
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
            <span>The information is accurate to the best of my knowledge, and I agree to have it reviewed by the T County Connect team. I understand nothing is published until it&apos;s verified.</span>
          </label>
        )}
        <Err state={state} name="consent" />
      </fieldset>

      <FormMessage state={state} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button type="submit" disabled={pending} className="btn-primary sm:min-w-48">
          {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {pending ? (mode === "create" ? "Sending…" : "Saving…") : submitLabel ?? (mode === "create" ? "Send suggestion" : "Save changes")}
        </button>
        <p className="text-sm text-slate-500">Suggestions are reviewed by our local team before anything is published.</p>
      </div>
    </form>
  );
}

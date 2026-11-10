"use client";
import { useActionState, useState } from "react";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { SmartImage } from "@/components/ui/smart-image";
import { setVisiblePhotosAction, updatePhotoAltAction } from "@/app/dashboard/[businessId]/actions";

/** Inline alt-text editor for one gallery photo. */
export function PhotoAltForm({ businessId, photoId, alt }: { businessId: string; photoId: string; alt: string }) {
  const [state, action] = useActionState(updatePhotoAltAction, null);
  return (
    <form action={action} className="space-y-1.5">
      <input type="hidden" name="businessId" value={businessId} />
      <input type="hidden" name="photoId" value={photoId} />
      <div className="flex gap-1.5">
        <input name="alt" defaultValue={alt} maxLength={200} className="input !min-h-9 flex-1 py-1 text-sm" placeholder="Describe the photo" aria-label="Photo description (alt text)" />
        <SubmitButton className="btn-secondary btn-sm shrink-0" pendingText="…">Save</SubmitButton>
      </div>
      {state?.error && <p role="alert" className="text-xs text-red-600">{state.error}</p>}
      {state?.message && <p role="status" className="text-xs text-emerald-700">{state.message}</p>}
    </form>
  );
}

/** Downgrade helper: choose which photos stay public (at most `max`). */
export function VisiblePhotosForm({ businessId, max, photos }: { businessId: string; max: number; photos: { id: string; url: string; alt: string | null; visibleOnFree: boolean }[] }) {
  const [state, action] = useActionState(setVisiblePhotosAction, null);
  const [picked, setPicked] = useState<string[]>(photos.filter((p) => p.visibleOnFree).map((p) => p.id).slice(0, max));
  const toggle = (id: string) => setPicked((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= max ? s : [...s, id]));
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="businessId" value={businessId} />
      <p className="text-sm text-slate-700"><strong>{picked.length} of {max}</strong> selected{picked.length === 0 && " — until you choose, your first photos are shown"}.</p>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {photos.map((p) => {
          const on = picked.includes(p.id);
          const disabled = !on && picked.length >= max;
          return (
            <li key={p.id}>
              <label className={`relative block cursor-pointer overflow-hidden rounded-lg ring-2 ${on ? "ring-brand-600" : "ring-transparent"} ${disabled ? "cursor-not-allowed opacity-50" : ""}`}>
                <span className="relative block aspect-square bg-slate-100">
                  <SmartImage src={p.url} alt={p.alt ?? ""} fill sizes="120px" className="object-cover" />
                </span>
                <input type="checkbox" name="visible" value={p.id} checked={on} disabled={disabled} onChange={() => toggle(p.id)}
                  className="absolute left-1.5 top-1.5 h-5 w-5 rounded border-slate-300" aria-label={`Show ${p.alt || "this photo"} publicly`} />
              </label>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <SubmitButton className="btn-primary btn-sm" pendingText="Saving…">Save choices</SubmitButton>
        <div className="flex-1"><FormMessage state={state} /></div>
      </div>
    </form>
  );
}

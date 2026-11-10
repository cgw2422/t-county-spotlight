"use client";
import { useActionState, useState } from "react";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { ImageUpload } from "@/components/ui/image-upload";
import { createUpdateAction } from "@/app/dashboard/[businessId]/actions";
import { OWNER_UPDATE_KIND_OPTIONS } from "@/lib/openings-shared";
import { TUSCARAWAS_CITIES } from "@/lib/utils";
import { TextArea, TextField, echoed } from "./fields";

export function UpdateForm({ businessId }: { businessId: string }) {
  const [state, action] = useActionState(createUpdateAction, null);
  const [round, setRound] = useState(0);
  const [seen, setSeen] = useState(state);
  const [kind, setKind] = useState("GENERAL");
  if (state !== seen) { setSeen(state); if (state?.ok) { setRound((r) => r + 1); setKind("GENERAL"); } }
  const opening = kind !== "GENERAL";
  const val = (n: string) => (state?.ok ? "" : echoed(state?.values, n, ""));
  return (
    <div className="space-y-4">
      <FormMessage state={state} />
      <form action={action} className="space-y-4" key={round}>
        <input type="hidden" name="businessId" value={businessId} />
        <div>
          <label htmlFor="f-kind" className="label">This is a… <span className="font-normal text-slate-400">(optional)</span></label>
          <select id="f-kind" name="kind" className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
            {OWNER_UPDATE_KIND_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {opening && <p className="help text-sm">Openings, moves and expansions are reviewed by our team and can also appear in New &amp; Coming Soon.</p>}
        </div>
        <TextField label="Headline" name="title" required maxLength={140} placeholder="e.g. New fall menu is here!" defaultValue={val("title")} />
        <TextArea label="Message" name="body" required rows={5} maxLength={4000} defaultValue={val("body")} />
        {opening && (
          <>
            <TextField label="Date" name="effectiveDate" type="date" defaultValue={val("effectiveDate")} hint="Only if the date is set and announced." />
            <TextField label="Timing" name="dateNote" maxLength={80} placeholder="e.g. Spring 2027" defaultValue={val("dateNote")} hint="Use this instead of a date when the exact day isn't set." />
            {kind === "RELOCATING" && (
              <>
                <TextField label="New address" name="address" maxLength={200} defaultValue={val("address")} />
                <TextField label="New town" name="city" maxLength={80} list="upd-city-list" defaultValue={val("city")} />
                <datalist id="upd-city-list">{TUSCARAWAS_CITIES.map((c) => <option key={c} value={c} />)}</datalist>
              </>
            )}
          </>
        )}
        <ImageUpload name="imageUrl" label="Photo (optional)" businessId={businessId} />
        <SubmitButton className="btn-primary w-full" pendingText="Posting…">{opening ? "Send for review" : "Post update"}</SubmitButton>
      </form>
    </div>
  );
}

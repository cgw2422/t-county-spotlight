"use client";
import { useActionState, useState } from "react";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { ImageUpload } from "@/components/ui/image-upload";
import { addPhotoAction } from "@/app/dashboard/[businessId]/actions";

export function PhotoAddForm({ businessId }: { businessId: string }) {
  const [state, action] = useActionState(addPhotoAction, null);
  const [round, setRound] = useState(0);
  const [hasImage, setHasImage] = useState(false);
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state?.ok) { setRound((r) => r + 1); setHasImage(false); }
  }
  return (
    <form action={action} className="space-y-4" key={round}>
      <input type="hidden" name="businessId" value={businessId} />
      <FormMessage state={state} />
      <ImageUpload name="url" businessId={businessId} aspect="aspect-[4/3]" onUploaded={() => setHasImage(true)} />
      <div>
        <label htmlFor="alt" className="label">Describe the photo <span className="font-normal text-slate-400">(optional)</span></label>
        <input id="alt" name="alt" className="input" maxLength={200} placeholder="e.g. Our dining room on a Friday night" />
        <p className="help text-sm">Helps people using screen readers.</p>
      </div>
      <SubmitButton className="btn-primary w-full" disabled={!hasImage} pendingText="Adding…">Add to my gallery</SubmitButton>
    </form>
  );
}

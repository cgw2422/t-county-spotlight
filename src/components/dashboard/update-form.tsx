"use client";
import { useActionState, useEffect, useState } from "react";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { ImageUpload } from "@/components/ui/image-upload";
import { createUpdateAction } from "@/app/dashboard/[businessId]/actions";
import { TextArea, TextField, echoed } from "./fields";

export function UpdateForm({ businessId }: { businessId: string }) {
  const [state, action] = useActionState(createUpdateAction, null);
  const [round, setRound] = useState(0);
  useEffect(() => { if (state?.ok) setRound((r) => r + 1); }, [state]);
  return (
    <div className="space-y-4">
      <FormMessage state={state} />
      <form action={action} className="space-y-4" key={round}>
        <input type="hidden" name="businessId" value={businessId} />
        <TextField label="Headline" name="title" required maxLength={140} placeholder="e.g. New fall menu is here!" defaultValue={state?.ok ? "" : echoed(state?.values, "title", "")} />
        <TextArea label="Message" name="body" required rows={5} maxLength={4000} defaultValue={state?.ok ? "" : echoed(state?.values, "body", "")} />
        <ImageUpload name="imageUrl" label="Photo (optional)" businessId={businessId} />
        <SubmitButton className="btn-primary w-full" pendingText="Posting…">Post update</SubmitButton>
      </form>
    </div>
  );
}

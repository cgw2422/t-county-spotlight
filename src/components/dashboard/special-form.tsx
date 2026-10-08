"use client";
import { useActionState } from "react";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { ImageUpload } from "@/components/ui/image-upload";
import { saveSpecialAction } from "@/app/dashboard/[businessId]/actions";
import { FormSection, TextArea, TextField, echoed } from "./fields";

export type SpecialValues = {
  id?: string; title: string; description: string; imageUrl: string; startsAt: string; endsAt: string; terms: string; couponCode: string; redemptionLimit: string;
};

export function SpecialForm({ businessId, values, needsApproval }: { businessId: string; values: SpecialValues; needsApproval: boolean }) {
  const [state, action] = useActionState(saveSpecialAction, null);
  const fe = state?.fieldErrors ?? {};
  const ev = state?.values;
  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="businessId" value={businessId} />
      {values.id && <input type="hidden" name="promotionId" value={values.id} />}
      <FormMessage state={state} />
      <FormSection title="Your offer">
        <TextField label="Headline" name="title" defaultValue={echoed(ev, "title", values.title)} required maxLength={140} error={fe.title} placeholder="e.g. 20% off all pies this weekend" />
        <TextArea label="Details" name="description" defaultValue={echoed(ev, "description", values.description)} rows={5} maxLength={4000} hint="Explain the deal in plain words." />
        <ImageUpload name="imageUrl" label="Photo (optional)" defaultValue={values.imageUrl} businessId={businessId} />
      </FormSection>
      <FormSection title="When is it valid?" description="Your special disappears from the site automatically after the end date.">
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField label="Starts" name="startsAt" type="datetime-local" defaultValue={echoed(ev, "startsAt", values.startsAt)} hint="Leave blank to start right away." />
          <TextField label="Ends" name="endsAt" type="datetime-local" defaultValue={echoed(ev, "endsAt", values.endsAt)} error={fe.endsAt} hint="Leave blank for an ongoing offer." />
        </div>
      </FormSection>
      <FormSection title="Fine print">
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField label="Coupon code" name="couponCode" defaultValue={echoed(ev, "couponCode", values.couponCode)} maxLength={40} hint="If customers need to mention a code." />
          <TextField label="Limit (number of redemptions)" name="redemptionLimit" type="number" min={1} defaultValue={echoed(ev, "redemptionLimit", values.redemptionLimit)} error={fe.redemptionLimit} hint="Leave blank for unlimited." />
        </div>
        <TextArea label="Terms" name="terms" defaultValue={echoed(ev, "terms", values.terms)} rows={3} maxLength={2000} placeholder="e.g. One per customer. Not valid with other offers." />
      </FormSection>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SubmitButton name="intent" value="submit" className="btn-primary min-h-12 w-full text-base sm:w-auto" pendingText="Saving…">
          {needsApproval ? "Submit for approval" : "Publish special"}
        </SubmitButton>
        <SubmitButton name="intent" value="draft" className="btn-secondary min-h-12 w-full sm:w-auto">Save as draft</SubmitButton>
      </div>
    </form>
  );
}

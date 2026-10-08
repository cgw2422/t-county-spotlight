"use client";
import { useActionState } from "react";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { ImageUpload } from "@/components/ui/image-upload";
import { saveEventAction } from "@/app/dashboard/[businessId]/actions";
import { Checkbox, FormSection, TextArea, TextField, echoed, echoedChecked } from "./fields";

export type EventValues = {
  id?: string; title: string; description: string; imageUrl: string; startAt: string; endAt: string; allDay: boolean;
  locationName: string; address: string; city: string; ticketUrl: string; isFree: boolean; price: string; categoryId: string;
};

export function EventForm({ businessId, values, categories, needsApproval }: { businessId: string; values: EventValues; categories: { id: string; name: string }[]; needsApproval: boolean }) {
  const [state, action] = useActionState(saveEventAction, null);
  const fe = state?.fieldErrors ?? {};
  const ev = state?.values;
  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="businessId" value={businessId} />
      {values.id && <input type="hidden" name="eventId" value={values.id} />}
      <FormMessage state={state} />
      <FormSection title="What's happening?">
        <TextField label="Event name" name="title" defaultValue={echoed(ev, "title", values.title)} required maxLength={160} error={fe.title} placeholder="e.g. Fall Harvest Tasting Night" />
        <TextArea label="Description" name="description" defaultValue={echoed(ev, "description", values.description)} rows={6} maxLength={8000} hint="What should people expect? Who is it for? Anything to bring?" />
        {categories.length > 0 && (
          <div>
            <label htmlFor="f-categoryId" className="label">Type of event <span className="font-normal text-slate-400">(optional)</span></label>
            <select id="f-categoryId" name="categoryId" defaultValue={echoed(ev, "categoryId", values.categoryId)} className="input">
              <option value="">Choose one…</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
        <ImageUpload name="imageUrl" label="Event photo or flyer (optional)" defaultValue={values.imageUrl} businessId={businessId} />
      </FormSection>
      <FormSection title="When?">
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField label="Starts" name="startAt" type="datetime-local" defaultValue={echoed(ev, "startAt", values.startAt)} required error={fe.startAt} />
          <TextField label="Ends" name="endAt" type="datetime-local" defaultValue={echoed(ev, "endAt", values.endAt)} error={fe.endAt} />
        </div>
        <Checkbox name="allDay" defaultChecked={echoedChecked(ev, "allDay", values.allDay)} label="This is an all-day event" />
      </FormSection>
      <FormSection title="Where?" description="Leave the place name blank to use your business name.">
        <TextField label="Place name" name="locationName" defaultValue={echoed(ev, "locationName", values.locationName)} maxLength={160} />
        <div className="grid gap-5 sm:grid-cols-[2fr_1fr]">
          <TextField label="Address" name="address" defaultValue={echoed(ev, "address", values.address)} maxLength={200} />
          <TextField label="City" name="city" defaultValue={echoed(ev, "city", values.city)} maxLength={80} />
        </div>
      </FormSection>
      <FormSection title="Tickets & cost">
        <Checkbox name="isFree" defaultChecked={echoedChecked(ev, "isFree", values.isFree)} label="This event is free" />
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField label="Price" name="price" defaultValue={echoed(ev, "price", values.price)} maxLength={80} placeholder="e.g. $10 adults, kids free" />
          <TextField label="Tickets or more info link" name="ticketUrl" defaultValue={echoed(ev, "ticketUrl", values.ticketUrl)} inputMode="url" error={fe.ticketUrl} />
        </div>
      </FormSection>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SubmitButton className="btn-primary min-h-12 w-full text-base sm:w-auto" pendingText="Sending…">
          {needsApproval ? (values.id ? "Save and resubmit" : "Submit event for review") : "Publish event"}
        </SubmitButton>
        {needsApproval && <p className="text-sm text-slate-500">Our team reviews events before they appear on the calendar.</p>}
      </div>
    </form>
  );
}

"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { FormMessage, type ActionState } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { ImageUpload } from "@/components/ui/image-upload";
import { submitEvent } from "./actions";

type Props = {
  categories: { id: string; name: string }[];
  cities: string[];
  businesses: { id: string; name: string }[];
  signedInEmail: string | null;
  canUpload: boolean;
  today: string;
};

function Err({ state, name }: { state: ActionState; name: string }) {
  const m = state?.fieldErrors?.[name];
  return m ? <p id={`${name}-err`} className="mt-1 text-sm text-red-600">{m}</p> : null;
}

export function EventSubmitForm({ categories, cities, businesses, signedInEmail, canUpload, today }: Props) {
  const [state, action] = useActionState(submitEvent, null);
  const [allDay, setAllDay] = useState(false);
  const [isFree, setIsFree] = useState(true);
  const [businessId, setBusinessId] = useState(businesses[0]?.id ?? "");
  const inv = (n: string) => (state?.fieldErrors?.[n] ? { "aria-invalid": true, "aria-describedby": `${n}-err` } : {});

  if (state?.ok) {
    return (
      <div role="status" className="card p-8 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" aria-hidden />
        <h2 className="mt-4 font-display text-2xl font-semibold text-navy-900">Thank you!</h2>
        <p className="mx-auto mt-2 max-w-md text-slate-600">{state.message}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/events/" className="btn-primary">Browse events</Link>
          <button type="button" onClick={() => window.location.reload()} className="btn-secondary">Submit another</button>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-8" noValidate>
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="company_website">Leave this empty</label>
        <input id="company_website" name="company_website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <fieldset className="card space-y-5 p-5 sm:p-6">
        <legend className="sr-only">Event</legend>
        <h2 className="font-display text-xl font-semibold text-navy-900">The event</h2>
        <div>
          <label htmlFor="title" className="label">Event name <span className="text-red-600">*</span></label>
          <input id="title" name="title" required maxLength={150} className="input" {...inv("title")} />
          <Err state={state} name="title" />
        </div>
        <div>
          <label htmlFor="description" className="label">Description</label>
          <textarea id="description" name="description" rows={6} maxLength={5000} className="input" placeholder="What should people know? Who is it for? What should they bring?" />
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="categoryId" className="label">Category</label>
            <select id="categoryId" name="categoryId" className="input" defaultValue="">
              <option value="">Choose a category</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="organizer" className="label">Organizer / host</label>
            <input id="organizer" name="organizer" maxLength={150} className="input" />
          </div>
        </div>
        {businesses.length > 0 && (
          <div>
            <label htmlFor="businessId" className="label">Hosted by one of your businesses</label>
            <select id="businessId" name="businessId" className="input" value={businessId} onChange={(e) => setBusinessId(e.target.value)}>
              <option value="">Not affiliated with my business</option>
              {businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <p className="help">The event will appear on your business profile.</p>
          </div>
        )}
        {canUpload && (businessId || businesses.length === 0) && (
          <ImageUpload name="imageUrl" label="Event image (optional)" businessId={businessId || undefined} />
        )}
      </fieldset>

      <fieldset className="card space-y-5 p-5 sm:p-6">
        <legend className="sr-only">Date and time</legend>
        <h2 className="font-display text-xl font-semibold text-navy-900">Date &amp; time</h2>
        <label className="flex min-h-11 items-center gap-3 text-sm font-medium text-slate-700">
          <input type="checkbox" name="allDay" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="h-5 w-5 rounded border-slate-300" /> All-day event
        </label>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="startDate" className="label">Start date <span className="text-red-600">*</span></label>
            <input id="startDate" name="startDate" type="date" min={today} required className="input" {...inv("startDate")} />
            <Err state={state} name="startDate" />
          </div>
          {!allDay && (
            <div>
              <label htmlFor="startTime" className="label">Start time <span className="text-red-600">*</span></label>
              <input id="startTime" name="startTime" type="time" className="input" {...inv("startTime")} />
              <Err state={state} name="startTime" />
            </div>
          )}
          <div>
            <label htmlFor="endDate" className="label">End date</label>
            <input id="endDate" name="endDate" type="date" min={today} className="input" />
            <p className="help">Leave blank if it ends the same day.</p>
          </div>
          {!allDay && (
            <div>
              <label htmlFor="endTime" className="label">End time</label>
              <input id="endTime" name="endTime" type="time" className="input" {...inv("endTime")} />
              <Err state={state} name="endTime" />
            </div>
          )}
        </div>
        <p className="help">Times are Eastern (Ohio) time.</p>
      </fieldset>

      <fieldset className="card space-y-5 p-5 sm:p-6">
        <legend className="sr-only">Location</legend>
        <h2 className="font-display text-xl font-semibold text-navy-900">Location</h2>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="locationName" className="label">Venue name</label>
            <input id="locationName" name="locationName" maxLength={150} className="input" placeholder="e.g. Tuscora Park" />
          </div>
          <div>
            <label htmlFor="city" className="label">Town <span className="text-red-600">*</span></label>
            <input id="city" name="city" list="city-list" required maxLength={80} className="input" {...inv("city")} />
            <datalist id="city-list">{cities.map((c) => <option key={c} value={c} />)}</datalist>
            <Err state={state} name="city" />
          </div>
        </div>
        <div>
          <label htmlFor="address" className="label">Street address</label>
          <input id="address" name="address" maxLength={200} className="input" autoComplete="street-address" />
        </div>
      </fieldset>

      <fieldset className="card space-y-5 p-5 sm:p-6">
        <legend className="sr-only">Tickets</legend>
        <h2 className="font-display text-xl font-semibold text-navy-900">Admission</h2>
        <label className="flex min-h-11 items-center gap-3 text-sm font-medium text-slate-700">
          <input type="checkbox" name="isFree" checked={isFree} onChange={(e) => setIsFree(e.target.checked)} className="h-5 w-5 rounded border-slate-300" /> This event is free
        </label>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {!isFree && (
            <div>
              <label htmlFor="price" className="label">Price</label>
              <input id="price" name="price" maxLength={80} className="input" placeholder="e.g. $10 adults, kids free" />
            </div>
          )}
          <div className={isFree ? "sm:col-span-2" : ""}>
            <label htmlFor="ticketUrl" className="label">Tickets or registration link</label>
            <input id="ticketUrl" name="ticketUrl" type="url" inputMode="url" maxLength={500} className="input" placeholder="https://" {...inv("ticketUrl")} />
            <Err state={state} name="ticketUrl" />
          </div>
        </div>
      </fieldset>

      <fieldset className="card space-y-5 p-5 sm:p-6">
        <legend className="sr-only">Your contact</legend>
        <h2 className="font-display text-xl font-semibold text-navy-900">Your contact info</h2>
        {signedInEmail ? (
          <p className="text-sm text-slate-600">We&rsquo;ll follow up at <strong>{signedInEmail}</strong>.</p>
        ) : (
          <div>
            <label htmlFor="email" className="label">Your email <span className="text-red-600">*</span></label>
            <input id="email" name="email" type="email" required autoComplete="email" className="input" {...inv("email")} />
            <Err state={state} name="email" />
            <p className="help">Only used to contact you about this event — never shown publicly.</p>
          </div>
        )}
      </fieldset>

      <FormMessage state={state} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SubmitButton className="btn-primary sm:min-w-48" pendingText="Submitting…">Submit event</SubmitButton>
        <p className="text-sm text-slate-500">Events are reviewed before they appear on the calendar.</p>
      </div>
    </form>
  );
}

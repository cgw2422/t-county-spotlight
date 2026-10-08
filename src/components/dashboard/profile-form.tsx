"use client";
import { useActionState } from "react";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { ImageUpload } from "@/components/ui/image-upload";
import { updateProfileAction } from "@/app/dashboard/[businessId]/actions";
import { Checkbox, FormSection, TextArea, TextField, echoed, echoedChecked } from "./fields";
import { DAY_NAMES, type HoursRow } from "./text";

export type ProfileValues = {
  name: string; tagline: string; description: string; logoUrl: string; coverUrl: string; categoryIds: string[];
  address: string; city: string; zip: string; phone: string; email: string; emailPublic: boolean; website: string;
  socials: Record<string, string>; hours: HoursRow[];
};

const SOCIALS = [
  ["facebook", "Facebook page"], ["instagram", "Instagram"], ["x", "X (Twitter)"], ["tiktok", "TikTok"], ["youtube", "YouTube"], ["linkedin", "LinkedIn"],
] as const;

export function ProfileForm({ businessId, values, categories, cities }: { businessId: string; values: ProfileValues; categories: { id: string; name: string }[]; cities: string[] }) {
  const [state, action] = useActionState(updateProfileAction, null);
  const fe = state?.fieldErrors ?? {};
  const ev = state?.values;
  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="businessId" value={businessId} />
      <input type="hidden" name="descriptionOriginal" value={values.description} />

      <FormSection id="basics" title="The basics" description="This is what people see first.">
        <TextField label="Business name" name="name" defaultValue={echoed(ev, "name", values.name)} required maxLength={120} error={fe.name} />
        <TextField label="Tagline" name="tagline" defaultValue={echoed(ev, "tagline", values.tagline)} maxLength={160} hint="One short line, like “Family-owned bakery since 1952”." />
        <TextArea label="About your business" name="description" defaultValue={echoed(ev, "description", values.description)} rows={8} maxLength={8000}
          hint="Tell people what makes you special. Leave a blank line between paragraphs." />
        <fieldset>
          <legend className="label">Categories <span className="font-normal text-slate-400">(pick up to 5)</span></legend>
          <div className="grid max-h-64 gap-x-4 overflow-y-auto rounded-xl border border-slate-200 p-3 sm:grid-cols-2">
            {categories.map((c) => (
              <label key={c.id} className="flex min-h-10 cursor-pointer items-center gap-3 text-sm">
                <input type="checkbox" name="categoryIds" value={c.id} defaultChecked={echoedChecked(ev, "categoryIds", values.categoryIds.includes(c.id), c.id)} className="h-5 w-5 rounded border-slate-300 text-brand-600" />
                {c.name}
              </label>
            ))}
            {categories.length === 0 && <p className="text-sm text-slate-500">No categories have been set up yet.</p>}
          </div>
        </fieldset>
      </FormSection>

      <FormSection id="images" title="Logo & cover photo" description="Square logos look best. Cover photos should be wide (landscape).">
        <div className="grid gap-6 sm:grid-cols-[200px_1fr]">
          <div className="max-w-[200px]"><ImageUpload name="logoUrl" label="Logo" defaultValue={values.logoUrl} businessId={businessId} aspect="aspect-square" /></div>
          <ImageUpload name="coverUrl" label="Cover photo" defaultValue={values.coverUrl} businessId={businessId} aspect="aspect-video" />
        </div>
      </FormSection>

      <FormSection id="contact" title="Contact & location">
        <TextField label="Street address" name="address" defaultValue={echoed(ev, "address", values.address)} autoComplete="street-address" maxLength={200} />
        <div className="grid gap-5 sm:grid-cols-[2fr_1fr]">
          <div>
            <TextField label="City or village" name="city" defaultValue={echoed(ev, "city", values.city)} list="tc-cities" maxLength={80} />
            <datalist id="tc-cities">{cities.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
          <TextField label="ZIP code" name="zip" defaultValue={echoed(ev, "zip", values.zip)} inputMode="numeric" maxLength={10} error={fe.zip} />
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField label="Phone" name="phone" type="tel" defaultValue={echoed(ev, "phone", values.phone)} autoComplete="tel" error={fe.phone} />
          <TextField label="Website" name="website" defaultValue={echoed(ev, "website", values.website)} inputMode="url" placeholder="www.example.com" error={fe.website} />
        </div>
        <TextField label="Email" name="email" type="email" defaultValue={echoed(ev, "email", values.email)} error={fe.email} hint="We use this to reach you." />
        <Checkbox name="emailPublic" defaultChecked={echoedChecked(ev, "emailPublic", values.emailPublic)} label="Show my email on my public listing" hint="Leave unchecked to keep it private." />
      </FormSection>

      <FormSection id="social" title="Social media" description="Paste the full link to each page you use. Leave the rest blank.">
        <div className="grid gap-5 sm:grid-cols-2">
          {SOCIALS.map(([k, label]) => (
            <TextField key={k} label={label} name={`social_${k}`} defaultValue={echoed(ev, `social_${k}`, values.socials[k] ?? "")} inputMode="url" placeholder="https://" error={fe[`social_${k}`]} />
          ))}
        </div>
      </FormSection>

      <FormSection id="hours" title="Opening hours" description="Leave a day blank if your hours vary. Tick “Closed” for days you're closed.">
        {fe.hours && <p className="text-sm text-red-600">{fe.hours}</p>}
        <div className="divide-y divide-slate-100">
          {values.hours.map((h) => (
            <div key={h.day} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 py-3 sm:grid-cols-[120px_1fr_auto]">
              <span className="font-medium text-navy-900">{DAY_NAMES[h.day]}</span>
              <label className="flex items-center gap-2 text-sm text-slate-600 sm:order-3">
                <input type="checkbox" name={`closed_${h.day}`} defaultChecked={echoedChecked(ev, `closed_${h.day}`, h.closed)} className="h-5 w-5 rounded border-slate-300" /> Closed
              </label>
              <div className="col-span-2 flex items-center gap-2 sm:col-span-1">
                <input type="time" name={`open_${h.day}`} defaultValue={echoed(ev, `open_${h.day}`, h.open)} aria-label={`${DAY_NAMES[h.day]} opening time`} className="input" />
                <span className="text-slate-400">to</span>
                <input type="time" name={`close_${h.day}`} defaultValue={echoed(ev, `close_${h.day}`, h.close)} aria-label={`${DAY_NAMES[h.day]} closing time`} className="input" />
              </div>
            </div>
          ))}
        </div>
      </FormSection>

      <div className="sticky bottom-[calc(4rem+var(--safe-bottom))] z-20 -mx-4 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border lg:bottom-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <SubmitButton className="btn-primary min-h-12 w-full text-base sm:w-auto" pendingText="Saving…">Save changes</SubmitButton>
          <div className="flex-1"><FormMessage state={state} /></div>
        </div>
      </div>
    </form>
  );
}

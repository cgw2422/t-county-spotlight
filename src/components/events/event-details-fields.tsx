import { EVENT_TAGS, VENDOR_INFO_MAX } from "@/lib/events";

/**
 * "Event details" checkboxes (stored as Event.tags) and optional vendor
 * information. Shared by the admin, business-owner and public event forms.
 */
export function EventDetailsFields({ tags = [], vendorInfo = "", idPrefix = "ev" }: { tags?: string[]; vendorInfo?: string; idPrefix?: string }) {
  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="label">Event details <span className="font-normal text-slate-500">(check any that apply)</span></legend>
        <div className="mt-1 grid grid-cols-1 gap-x-4 sm:grid-cols-2">
          {EVENT_TAGS.map((t) => (
            <label key={t.key} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-slate-800">
              <input type="checkbox" name="tags" value={t.key} defaultChecked={tags.includes(t.key)} className="h-5 w-5 shrink-0 rounded border-slate-300 accent-brand-600" />
              {t.label}
            </label>
          ))}
        </div>
        <p className="help">Helps residents find your event with filters like Family-friendly or Outdoor.</p>
      </fieldset>
      <div>
        <label htmlFor={`${idPrefix}-vendorInfo`} className="label">Vendor information <span className="font-normal text-slate-500">(optional)</span></label>
        <textarea id={`${idPrefix}-vendorInfo`} name="vendorInfo" rows={4} maxLength={VENDOR_INFO_MAX} defaultValue={vendorInfo} className="input" placeholder="For markets and craft shows: which vendors will be there, how to become a vendor, booth fees…" />
      </div>
    </div>
  );
}

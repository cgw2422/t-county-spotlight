import { ActionForm, DirtyIndicator, Submit } from "@/components/admin/action-form";
import { Card } from "@/components/admin/page-header";
import { Checkbox, FormGrid, SelectField, TextField } from "@/components/admin/form-field";
import { MediaField } from "@/components/admin/media-picker";
import { SearchSelect } from "@/components/admin/search-select";
import { CitySelect } from "@/components/admin/city-select";
import { RichTextEditor } from "@/components/editor/rich-text-editor";
import type { Recurrence } from "@/lib/events";
import { toDateInput } from "@/lib/utils";
import type { Event } from "@/generated/prisma/client";
import { saveEvent } from "./actions";

export const EVENT_STATUS_OPTIONS = [
  { value: "PUBLISHED", label: "Published" }, { value: "PENDING", label: "Pending review" }, { value: "DRAFT", label: "Draft" },
  { value: "UNPUBLISHED", label: "Unpublished" }, { value: "REJECTED", label: "Rejected" }, { value: "ARCHIVED", label: "Archived" },
];

export function EventForm({ e, categories, business }: { e: Event | null; categories: { id: string; name: string }[]; business?: { id: string; label: string; sub?: string | null } | null }) {
  const rec = (e?.recurrence ?? null) as Recurrence | null;
  return (
    <ActionForm action={saveEvent} warnUnsaved className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      {e && <input type="hidden" name="id" value={e.id} />}
      <div className="min-w-0 space-y-6">
        <Card title="Event">
          <div className="space-y-4">
            <TextField name="title" label="Title" required defaultValue={e?.title} maxLength={200} />
            <TextField name="slug" label="Slug" defaultValue={e?.slug} help={e ? `Public URL: /events/${e.slug}/` : "Leave blank to generate from the title."} />
            <RichTextEditor name="description" label="Description" defaultValue={e?.description} compact minHeight="min-h-[200px]" />
          </div>
        </Card>
        <Card title="Date & time" description="Eastern Time (America/New_York).">
          <div className="space-y-4">
            <FormGrid>
              <TextField name="startAt" type="datetime-local" label="Starts" required defaultValue={toDateInput(e?.startAt)} />
              <TextField name="endAt" type="datetime-local" label="Ends" defaultValue={toDateInput(e?.endAt)} />
            </FormGrid>
            <Checkbox name="allDay" label="All-day event" defaultChecked={e?.allDay} />
            <fieldset className="rounded-xl border border-slate-200 p-4">
              <legend className="px-1 text-sm font-semibold text-slate-700">Repeats</legend>
              <FormGrid cols={3}>
                <SelectField name="freq" label="Frequency" defaultValue={rec?.freq ?? ""} options={[{ value: "", label: "Does not repeat" }, { value: "DAILY", label: "Daily" }, { value: "WEEKLY", label: "Weekly" }, { value: "MONTHLY", label: "Monthly" }]} />
                <TextField name="interval" type="number" min={1} max={52} label="Every" defaultValue={rec?.interval ?? 1} help="e.g. 2 = every other week" />
                <TextField name="until" type="date" label="Until" defaultValue={rec?.until ? toDateInput(new Date(rec.until)).slice(0, 10) : ""} />
              </FormGrid>
            </fieldset>
          </div>
        </Card>
        <Card title="Location">
          <FormGrid>
            <TextField name="locationName" label="Venue" defaultValue={e?.locationName ?? ""} placeholder="Tuscora Park" />
            <TextField name="address" label="Address" defaultValue={e?.address ?? ""} />
            <CitySelect defaultValue={e?.city} />
            <TextField name="organizer" label="Organizer" defaultValue={e?.organizer ?? ""} />
          </FormGrid>
        </Card>
        <Card title="Tickets">
          <div className="space-y-3">
            <Checkbox name="isFree" label="Free event" defaultChecked={e ? e.isFree : true} />
            <FormGrid>
              <TextField name="price" label="Price" defaultValue={e?.price ?? ""} placeholder="$10 adults, kids free" help="Used when the event is not free." />
              <TextField name="ticketUrl" type="url" label="Ticket / info link" defaultValue={e?.ticketUrl ?? ""} placeholder="https://" />
            </FormGrid>
          </div>
        </Card>
      </div>
      <aside className="min-w-0 space-y-6 lg:sticky lg:top-20 lg:self-start">
        <Card title="Publishing">
          <div className="space-y-2">
            <SelectField name="status" label="Status" defaultValue={e?.status ?? "PUBLISHED"} options={EVENT_STATUS_OPTIONS} />
            <Checkbox name="isFeatured" label="Featured" defaultChecked={e?.isFeatured} />
            <Checkbox name="isSponsored" label="Sponsored (paid)" defaultChecked={e?.isSponsored} help="Shows a “Sponsored” label on the site." />
          </div>
          <div className="mt-4 border-t border-slate-100 pt-4">
            <Submit className="btn-primary w-full" pendingText="Saving…">{e ? "Save event" : "Create event"}</Submit>
            <div className="mt-2 text-center"><DirtyIndicator /></div>
          </div>
        </Card>
        <Card title="Details">
          <div className="space-y-4">
            <SelectField name="categoryId" label="Category" defaultValue={e?.categoryId ?? ""} placeholder="No category" options={categories.map((c) => ({ value: c.id, label: c.name }))} />
            <SearchSelect name="business" type="business" multiple={false} label="Hosting business" initial={business ? [business] : []} placeholder="Search businesses…" />
          </div>
        </Card>
        <Card title="Image"><MediaField name="imageUrl" defaultValue={e?.imageUrl} /></Card>
      </aside>
    </ActionForm>
  );
}

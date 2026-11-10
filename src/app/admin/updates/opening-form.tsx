import { Card } from "@/components/admin/page-header";
import { ActionForm, Submit } from "@/components/admin/action-form";
import { FormGrid, SelectField, TextArea, TextField } from "@/components/admin/form-field";
import { SearchSelect } from "@/components/admin/search-select";
import { CitySelect } from "@/components/admin/city-select";
import { PhotoManager } from "@/components/admin/photo-manager";
import { nyDateKey } from "@/components/public/dates";
import { OPENING_FEATURED_DAYS, OPENING_KINDS, OPENING_LABELS } from "@/lib/openings-shared";
import { saveOpening } from "./actions";

export type OpeningFormValues = {
  id?: string;
  kind: string;
  status: string;
  business: { id: string; label: string; sub?: string | null } | null;
  businessName: string | null;
  address: string | null;
  city: string | null;
  title: string;
  body: string;
  photos: string[];
  effectiveDate: Date | null;
  dateNote: string | null;
  linkUrl: string | null;
  featuredUntil: Date | null;
};

const KIND_OPTIONS = [...OPENING_KINDS.map((k) => ({ value: k, label: OPENING_LABELS[k] })), { value: "GENERAL", label: "General business update (not an opening)" }];
const STATUS_OPTIONS = [
  { value: "DRAFT", label: "Draft (not public)" },
  { value: "PENDING", label: "Pending review" },
  { value: "PUBLISHED", label: "Published" },
  { value: "ARCHIVED", label: "Rejected / hidden" },
];

/** Staff form for New & Coming Soon entries. Shared by /admin/updates/new/ and /admin/updates/[id]/. */
export function OpeningForm({ v }: { v: OpeningFormValues }) {
  return (
    <ActionForm action={saveOpening} warnUnsaved className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      {v.id && <input type="hidden" name="id" value={v.id} />}
      <div className="min-w-0 space-y-6">
        <Card title="Business">
          <div className="space-y-4">
            <SelectField name="kind" label="Status" defaultValue={v.kind} options={KIND_OPTIONS} />
            <SearchSelect name="businessId" type="business" multiple={false} label="Connect to an existing listing" initial={v.business ? [v.business] : []} placeholder="Search businesses…"
              help="When connected, the card links to the listing and uses its name. Leave empty for a business that isn't listed yet." />
            <TextField name="businessName" label="Business name (if not listed)" maxLength={160} defaultValue={v.businessName ?? ""} />
            <FormGrid>
              <TextField name="address" label="Address" maxLength={200} defaultValue={v.address ?? ""} help="For relocations, enter the new address." />
              <CitySelect name="city" label="Community" defaultValue={v.city} />
            </FormGrid>
          </div>
        </Card>
        <Card title="Announcement">
          <div className="space-y-4">
            <TextField name="title" label="Title" required maxLength={160} defaultValue={v.title} placeholder="e.g. Opening a second location downtown" />
            <TextArea name="body" label="Description" rows={6} maxLength={6000} defaultValue={v.body} help="Plain text. Only include details that have been confirmed." />
            <TextField name="linkUrl" type="url" label="Source / more info link" maxLength={500} defaultValue={v.linkUrl ?? ""} placeholder="https://" help="The announcement, news story or business page this information came from." />
          </div>
        </Card>
        <Card title="Photos" description="Use real photos of the business (with permission).">
          <PhotoManager name="photos" defaultValue={v.photos.map((url) => ({ url, alt: "", caption: "" }))} />
        </Card>
      </div>
      <aside className="space-y-4">
        <Card title="Dates">
          <div className="space-y-4">
            <TextField name="effectiveDate" type="date" label="Announced date" defaultValue={v.effectiveDate ? nyDateKey(v.effectiveDate) : ""}
              help="Only enter a date that has been officially announced. Never estimate." />
            <TextField name="dateNote" label="Timing note" maxLength={80} defaultValue={v.dateNote ?? ""} placeholder="e.g. Spring 2027"
              help="Shown when there's no announced date. Leave both empty if unknown." />
            <TextField name="featuredUntil" type="date" label="Show on the homepage until" defaultValue={v.featuredUntil ? nyDateKey(v.featuredUntil) : ""}
              help={`Leave empty for ${OPENING_FEATURED_DAYS} days after publishing. It stays on /new/ afterwards.`} />
          </div>
        </Card>
        <Card title="Publishing">
          <div className="space-y-4">
            <SelectField name="status" label="Status" defaultValue={v.status} options={STATUS_OPTIONS} />
            <Submit className="btn-primary w-full">{v.id ? "Save changes" : "Create"}</Submit>
          </div>
        </Card>
      </aside>
    </ActionForm>
  );
}

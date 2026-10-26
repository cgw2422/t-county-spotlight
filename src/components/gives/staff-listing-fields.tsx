import { Checkbox, FormGrid, SelectField, TextArea, TextField } from "@/components/admin/form-field";
import { IMAGE_RIGHTS, readImageRights } from "@/lib/gives/constants";

export type StaffListingValues = {
  slug?: string | null; publicPath?: string | null; seoTitle: string | null; seoDescription: string | null; internalNotes: string | null;
  sourceUrls: string[]; infoCheckedAt: Date | null; imageRights: string | null; donationVerified?: boolean;
};

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="card p-5 sm:p-6">
      <h2 className="text-lg font-semibold text-navy-900">{title}</h2>
      {description && <p className="mt-1 text-sm text-slate-600">{description}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

/**
 * Staff-only listing fields shown under the shared organization profile form
 * (admin "Add organization" and admin edit). Never shown to organization members.
 */
export function StaffListingFields({ v }: { v: StaffListingValues }) {
  const rights = readImageRights(v.imageRights);
  const checked = v.infoCheckedAt ? v.infoCheckedAt.toISOString().slice(0, 10) : "";
  return (
    <>
      <Section title="Staff: sources & accuracy" description="Where this information came from. Never invent descriptions, missions or service times — leave unknown fields blank.">
        <TextArea name="sourceUrls" label="Sources (one https:// link per line)" defaultValue={v.sourceUrls.join("\n")} rows={3} placeholder={"https://www.example.org/about\nhttps://www.facebook.com/example"} help="Public pages you used, e.g. the organization's website or a state filing." />
        <FormGrid>
          <TextField name="infoCheckedAt" type="date" label="Information last checked" defaultValue={checked} help="Defaults to today when sources are entered." />
          <div />
        </FormGrid>
        <FormGrid>
          <SelectField name="imageRights" label="Image rights (logo & cover)" defaultValue={rights.key} placeholder="No images / not set" options={IMAGE_RIGHTS.map((r) => ({ value: r.value, label: r.label }))} help="Required before a logo or cover photo can be saved." />
          <TextField name="imageRightsNote" label="Image rights note" defaultValue={rights.note} maxLength={300} placeholder="e.g. emailed by the pastor 10/2026; CC BY photographer name" />
        </FormGrid>
        <Checkbox name="donationVerified" label="Donation link verified by staff" defaultChecked={!!v.donationVerified} help="Confirm the donation link goes to the organization's own giving page. Recorded in the audit log. The Donate button only shows when a link is set." />
      </Section>
      <Section title="Staff: URL, SEO & internal notes">
        {v.slug != null && <TextField name="slug" label="Slug" defaultValue={v.slug} help={v.publicPath ? `Public URL: ${v.publicPath}` : undefined} />}
        <TextField name="seoTitle" label="SEO title" defaultValue={v.seoTitle ?? ""} maxLength={200} />
        <TextArea name="seoDescription" label="Meta description" defaultValue={v.seoDescription ?? ""} maxLength={400} rows={2} />
        <TextArea name="internalNotes" label="Internal notes (staff only)" defaultValue={v.internalNotes ?? ""} maxLength={5000} rows={3} />
      </Section>
    </>
  );
}

import { ActionForm, Submit } from "@/components/admin/action-form";
import { Card } from "@/components/admin/page-header";
import { Checkbox, FormGrid, SelectField, TextField } from "@/components/admin/form-field";
import { SearchSelect } from "@/components/admin/search-select";
import { RichTextEditor } from "@/components/editor/rich-text-editor";
import { toDateInput } from "@/lib/utils";
import type { Job } from "@/generated/prisma/client";
import { saveJob } from "./actions";

export function JobForm({ j, business }: { j: Job | null; business?: { id: string; label: string } | null }) {
  return (
    <ActionForm action={saveJob} warnUnsaved className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      {j && <input type="hidden" name="id" value={j.id} />}
      <div className="min-w-0 space-y-6">
        <Card title="Job">
          <div className="space-y-4">
            <TextField name="title" label="Job title" required defaultValue={j?.title} />
            <FormGrid>
              <SearchSelect name="business" type="business" multiple={false} label="Business" initial={business ? [business] : []} placeholder="Search businesses…" />
              <TextField name="employerName" label="Employer name" defaultValue={j?.employerName ?? ""} help="If the employer isn't in the directory." />
              <SelectField name="employmentType" label="Type" defaultValue={j?.employmentType ?? ""} placeholder="Not specified" options={["Full-time", "Part-time", "Seasonal", "Contract", "Internship", "Volunteer"]} />
              <TextField name="location" label="Location" defaultValue={j?.location ?? ""} placeholder="Dover, OH" />
              <TextField name="payRange" label="Pay" defaultValue={j?.payRange ?? ""} placeholder="$16–$18/hr" />
              <TextField name="slug" label="Slug" defaultValue={j?.slug} />
            </FormGrid>
            <RichTextEditor name="description" label="Description" defaultValue={j?.description} compact minHeight="min-h-[200px]" />
          </div>
        </Card>
        <Card title="How to apply">
          <FormGrid>
            <TextField name="applyUrl" type="url" label="Application link" defaultValue={j?.applyUrl ?? ""} placeholder="https://" />
            <TextField name="applyEmail" type="email" label="Application email" defaultValue={j?.applyEmail ?? ""} />
          </FormGrid>
        </Card>
      </div>
      <aside className="min-w-0 space-y-6 lg:sticky lg:top-20 lg:self-start">
        <Card title="Publishing">
          <div className="space-y-2">
            <SelectField name="status" label="Status" defaultValue={j?.status ?? "PUBLISHED"} options={[{ value: "PUBLISHED", label: "Published" }, { value: "PENDING", label: "Pending approval" }, { value: "DRAFT", label: "Draft" }, { value: "ARCHIVED", label: "Filled / archived" }]} />
            <TextField name="expiresAt" type="datetime-local" label="Expires" defaultValue={toDateInput(j?.expiresAt)} />
            <Checkbox name="isSponsored" label="Sponsored listing (paid)" defaultChecked={j?.isSponsored} />
          </div>
          <Submit className="btn-primary mt-4 w-full" pendingText="Saving…">{j ? "Save job" : "Create job"}</Submit>
        </Card>
      </aside>
    </ActionForm>
  );
}

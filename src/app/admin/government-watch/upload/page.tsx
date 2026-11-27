import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader, Card } from "@/components/admin/page-header";
import { ActionForm, Submit } from "@/components/admin/action-form";
import { Field, FormGrid, SelectField, TextField } from "@/components/admin/form-field";
import { DOC_TYPE_LABEL, DOC_TYPES } from "@/lib/gov-watch/shared";
import { uploadDocumentAction } from "../actions";
import { BASE } from "../_lib";

export const dynamic = "force-dynamic";
export const metadata = { title: "Upload a government document" };

export default async function UploadPage() {
  await requireAdmin();
  const sources = await db.govSource.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
  return (
    <>
      <PageHeader title="Upload a government document" back={{ href: `${BASE}/`, label: "Government Watch" }}
        description="For documents you received another way: a clerk’s email, a printed copy you scanned, a meeting packet. The file is kept exactly as uploaded; the same file is never stored twice." />
      <Card className="max-w-2xl">
        <ActionForm action={uploadDocumentAction} className="space-y-4">
          <Field label="File" required help="PDF, Word (.docx or .doc), web page (.html), text, or a scanned image (JPG, PNG, TIFF). Up to 30 MB. Scans are read by the AI.">
            <input type="file" name="file" required accept=".pdf,.docx,.doc,.html,.htm,.txt,.jpg,.jpeg,.png,.tif,.tiff,application/pdf,image/*" className="input" data-testid="upload-file" />
          </Field>
          <TextField label="Title (optional)" name="title" placeholder="Defaults to the file name" />
          <FormGrid>
            <SelectField label="Government source" name="sourceId" placeholder="Not assigned" options={sources.map((s) => ({ value: s.id, label: s.name }))} />
            <SelectField label="Document type" name="docType" defaultValue="minutes" options={DOC_TYPES.map((t) => ({ value: t, label: DOC_TYPE_LABEL[t] }))} />
            <TextField label="Meeting date (optional)" name="meetingDate" type="date" />
            <TextField label="Original web address (optional)" name="sourceUrl" type="url" placeholder="https://" />
          </FormGrid>
          <Submit pendingText="Uploading…">Upload document</Submit>
        </ActionForm>
      </Card>
    </>
  );
}

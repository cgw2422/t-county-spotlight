import { ActionForm, DirtyIndicator, Submit } from "@/components/admin/action-form";
import { Card } from "@/components/admin/page-header";
import { Checkbox, SelectField, TextArea, TextField } from "@/components/admin/form-field";
import { MediaField } from "@/components/admin/media-picker";
import { ContentEditor } from "@/components/editor/content-editor";
import type { Page } from "@/generated/prisma/client";
import { savePage } from "./actions";

export function PageForm({ p }: { p: Page | null }) {
  const imported = !!(p?.wpId || p?.originalContent);
  return (
    <ActionForm action={savePage} warnUnsaved className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      {p && <input type="hidden" name="id" value={p.id} />}
      <div className="min-w-0 space-y-6">
        <Card>
          <div className="space-y-4">
            <TextField name="title" label="Title" required defaultValue={p?.title} maxLength={200} className="text-lg font-semibold" />
            <TextField name="slug" label="Slug" defaultValue={p?.slug} help={p?.legacyPath ? `Imported page — public URL stays ${p.legacyPath}` : "The page lives at /your-slug/. Leave blank to generate from the title."} />
          </div>
        </Card>
        <Card>
          <ContentEditor name="content" defaultValue={p?.content} defaultMode={imported ? "html" : "visual"} imported={imported} />
        </Card>
        <Card title="SEO">
          <div className="space-y-4">
            <TextField name="seoTitle" label="SEO title" defaultValue={p?.seoTitle ?? ""} maxLength={200} />
            <TextArea name="seoDescription" label="Meta description" defaultValue={p?.seoDescription ?? ""} rows={2} maxLength={400} />
          </div>
        </Card>
      </div>
      <aside className="min-w-0 space-y-6 lg:sticky lg:top-20 lg:self-start">
        <Card title="Publishing">
          <div className="space-y-2">
            <SelectField name="status" label="Status" defaultValue={p?.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT"} options={[{ value: "DRAFT", label: "Draft" }, { value: "PUBLISHED", label: "Published" }]} />
            <Checkbox name="showInNav" label="Show in header navigation" defaultChecked={p?.showInNav} help="Adds a header menu link if there isn't one." />
          </div>
          <Submit className="btn-primary mt-4 w-full" pendingText="Saving…">{p ? "Save page" : "Create page"}</Submit>
          <div className="mt-2 text-center"><DirtyIndicator /></div>
        </Card>
        <Card title="Featured image"><MediaField name="featuredImageUrl" defaultValue={p?.featuredImageUrl} /></Card>
      </aside>
    </ActionForm>
  );
}

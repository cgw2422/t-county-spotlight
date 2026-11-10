"use client";
import { Rocket, Save, EyeOff } from "lucide-react";
import { ActionForm, DirtyIndicator, Submit } from "@/components/admin/action-form";
import { Checkbox, TextArea, TextField } from "@/components/admin/form-field";
import { AdminCoverField } from "@/components/ui/cover-photo-field";
import { saveCollection } from "./actions";

export type CollectionFormData = {
  id: string; title: string; slug: string; description: string; coverImageUrl: string; coverFocusX: number; coverFocusY: number;
  isFeatured: boolean; sortOrder: number; status: string; visibleCount: number;
};

export function CollectionForm({ c }: { c: CollectionFormData | null }) {
  const published = c?.status === "PUBLISHED";
  return (
    <ActionForm action={saveCollection} className="card space-y-5 p-4 sm:p-6" warnUnsaved>
      {c && <input type="hidden" name="id" value={c.id} />}
      <TextField name="title" label="Title" required maxLength={160} defaultValue={c?.title} placeholder="e.g. Free Things to Do in Tuscarawas County" />
      <TextField
        name="slug" label="URL slug" maxLength={120} defaultValue={c?.slug} placeholder="Created from the title"
        help={<>Leave blank to create it from the title. Public address: /explore/<strong>{c?.slug || "your-slug"}</strong>/</>}
      />
      <TextArea name="description" label="Description" maxLength={600} rows={3} defaultValue={c?.description} help="One or two sentences shown on Explore T County and at the top of the collection." />
      <AdminCoverField defaultValue={c?.coverImageUrl} focusX={c?.coverFocusX} focusY={c?.coverFocusY} label="Cover photo (optional)" />
      <p className="help -mt-3">Use an authentic photo of a real Tuscarawas County place — no stock photos.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Checkbox name="isFeatured" label="Featured" help="Featured collections are listed first on Explore T County." defaultChecked={c?.isFeatured} />
        <TextField name="sortOrder" type="number" label="Sort order" min={-1000} max={1000} defaultValue={c?.sortOrder ?? 0} help="Lower numbers appear first." />
      </div>
      {c && !published && c.visibleCount === 0 && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Publishing is available once the collection has at least one publicly visible item.</p>
      )}
      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
        <Submit name="intent" value="save" className="btn-secondary" pendingText="Saving…"><Save className="h-4 w-4" /> {c ? "Save changes" : "Create draft"}</Submit>
        {c && !published && <Submit name="intent" value="publish" className="btn-primary" pendingText="Publishing…"><Rocket className="h-4 w-4" /> Publish</Submit>}
        {c && published && <Submit name="intent" value="unpublish" className="btn-ghost" pendingText="Saving…"><EyeOff className="h-4 w-4" /> Unpublish</Submit>}
        <DirtyIndicator />
      </div>
    </ActionForm>
  );
}

"use client";
import { Save } from "lucide-react";
import { ActionForm, DirtyIndicator, Submit } from "@/components/admin/action-form";
import { TextArea } from "@/components/admin/form-field";
import { AdminCoverField } from "@/components/ui/cover-photo-field";
import { saveCommunityProfile } from "../actions";

export function CommunityProfileForm({ slug, name, intro, coverImageUrl, focusX, focusY }: { slug: string; name: string; intro: string; coverImageUrl: string; focusX: number; focusY: number }) {
  return (
    <ActionForm action={saveCommunityProfile} className="card max-w-3xl space-y-5 p-4 sm:p-6" warnUnsaved>
      <input type="hidden" name="slug" value={slug} />
      <AdminCoverField defaultValue={coverImageUrl} focusX={focusX} focusY={focusY} label="Cover photo (optional)" />
      <p className="help -mt-3">Use an authentic photo of {name} that you have the right to use.</p>
      <TextArea name="intro" label="Introduction (optional)" rows={5} maxLength={1500} defaultValue={intro} help={`A short, factual welcome to ${name}. Plain text; line breaks are kept.`} />
      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
        <Submit className="btn-primary" pendingText="Saving…"><Save className="h-4 w-4" /> Save</Submit>
        <DirtyIndicator />
      </div>
    </ActionForm>
  );
}

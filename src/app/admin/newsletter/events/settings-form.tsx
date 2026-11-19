"use client";
import { ActionForm, Submit } from "@/components/admin/action-form";
import { saveNewsletterEventsSettingsAction } from "./actions";

export function TemplateSettingsForm({ templateId }: { templateId: string | null }) {
  return (
    <ActionForm action={saveNewsletterEventsSettingsAction} className="space-y-3">
      <label className="block max-w-xl">
        <span className="label">beehiiv template ID (optional)</span>
        <input name="templateId" className="input font-mono text-sm" defaultValue={templateId ?? ""} placeholder="post_template_00000000-0000-0000-0000-000000000000" data-testid="template-id" />
        <span className="help">Leave empty to use your publication’s default template. Sent to beehiiv as <code className="rounded bg-slate-100 px-1 text-xs">post_template_id</code>.</span>
      </label>
      <Submit pendingText="Saving…" className="btn-secondary">Save settings</Submit>
    </ActionForm>
  );
}

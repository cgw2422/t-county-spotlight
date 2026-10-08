"use client";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload, Play } from "lucide-react";
import { FormMessage, type ActionState } from "@/components/ui/form-message";
import { startRestImport } from "./actions";

function Options({ prefix }: { prefix: string }) {
  const opts: [string, string, string][] = [
    ["dryRun", "Dry run", "Discover and plan only — nothing is written except the report."],
    ["force", "Overwrite local edits", "Re-import articles, pages and businesses that were edited here."],
    ["skipMedia", "Skip images", "Do not download media; image URLs keep pointing at WordPress."],
    ["importAllMedia", "Include unused library files", "Also copy media no content references."],
  ];
  return (
    <fieldset className="grid gap-2 sm:grid-cols-2">
      <legend className="sr-only">Options</legend>
      {opts.map(([name, label, help]) => (
        <label key={name} htmlFor={`${prefix}-${name}`} className="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200 px-3 py-2 hover:bg-slate-50">
          <input id={`${prefix}-${name}`} type="checkbox" name={name} className="mt-1 h-4 w-4 shrink-0" />
          <span className="text-sm"><span className="font-medium text-slate-900">{label}</span><span className="block text-xs text-slate-500">{help}</span></span>
        </label>
      ))}
    </fieldset>
  );
}

export function RestImportForm({ defaultUrl, disabled }: { defaultUrl: string; disabled?: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(startRestImport, null);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="baseUrl" className="label">WordPress site URL</label>
        <input id="baseUrl" name="baseUrl" type="url" required defaultValue={defaultUrl} className="input" placeholder="https://tcountyspotlight.com" inputMode="url" autoComplete="url" />
      </div>
      <Options prefix="rest" />
      <FormMessage state={state} />
      <button type="submit" className="btn-primary min-h-11" disabled={pending || disabled}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
        {pending ? "Starting…" : "Start REST import"}
      </button>
    </form>
  );
}

export function WxrImportForm({ disabled }: { disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  return (
    <form action="/api/admin/migration/wxr/" method="post" encType="multipart/form-data" className="space-y-4" onSubmit={() => setBusy(true)}>
      <div>
        <label htmlFor="wxr-file" className="label">WXR export file (.xml)</label>
        <input id="wxr-file" name="file" type="file" accept=".xml,application/xml,text/xml" required className="input py-2" />
        <p className="help">WordPress → Tools → Export → “All content”. Media files are downloaded from the live site, so it must still be online.</p>
      </div>
      <div>
        <label htmlFor="wxr-base" className="label">Site URL override (optional)</label>
        <input id="wxr-base" name="baseUrl" type="url" className="input" placeholder="Taken from the export when empty" />
      </div>
      <Options prefix="wxr" />
      <button type="submit" className="btn-secondary min-h-11" disabled={busy || disabled}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        {busy ? "Uploading…" : "Upload and import"}
      </button>
    </form>
  );
}

/** Refreshes the server component every few seconds while a run is in progress. */
export function AutoRefresh({ active, intervalMs = 3000 }: { active: boolean; intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(t);
  }, [active, intervalMs, router]);
  if (!active) return null;
  return (
    <p className="inline-flex items-center gap-2 text-sm text-slate-600" aria-live="polite">
      <Loader2 className="h-4 w-4 animate-spin" /> Running — this page refreshes automatically.
    </p>
  );
}

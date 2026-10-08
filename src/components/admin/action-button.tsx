"use client";
import { startTransition, useActionState, useState } from "react";
import { Loader2, AlertTriangle } from "lucide-react";
import type { ActionState } from "@/components/ui/form-message";
import { cn } from "@/lib/utils";
import { toast } from "./toast";
import type { FormAction } from "./action-form";

/**
 * One-click action button (approve, publish, delete…). Sends `fields` as form
 * data. With `confirm`, shows a confirmation dialog first (destructive actions).
 * Optional `prompt` collects a short reason (e.g. reject note).
 */
export function ActionButton({ action, fields = {}, children, className, confirm, prompt, title, reloadOnSuccess }: {
  action: FormAction;
  reloadOnSuccess?: boolean;
  fields?: Record<string, string>;
  children: React.ReactNode;
  className?: string;
  title?: string;
  confirm?: { title: string; body?: React.ReactNode; confirmLabel?: string; danger?: boolean };
  prompt?: { name: string; label: string; required?: boolean; placeholder?: string };
}) {
  // Toast as soon as the action resolves, so feedback survives the row unmounting (e.g. after trash).
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  // Toast as soon as the action resolves, so feedback survives the row unmounting (e.g. after trash).
  const [, dispatch, pending] = useActionState(async (prev: ActionState, fd: FormData) => {
    const r = await action(prev, fd);
    if (r?.error) toast(r.error, "error");
    else if (r?.message) toast(r.message);
    if (!r?.error) {
      setOpen(false);
      if (reloadOnSuccess) setTimeout(() => window.location.reload(), 600);
    }
    return r;
  }, null as ActionState);

  function run() {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.append(k, v);
    if (prompt) fd.append(prompt.name, reason);
    startTransition(() => dispatch(fd));
  }

  const needsDialog = !!confirm || !!prompt;
  return (
    <>
      <button type="button" title={title} disabled={pending} className={cn(className || "btn-secondary btn-sm")} onClick={() => (needsDialog ? setOpen(true) : run())}>
        {pending && !open && <Loader2 className="h-4 w-4 animate-spin" />}
        {children}
      </button>
      {open && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="ab-title">
          <button type="button" className="absolute inset-0 bg-slate-900/50" aria-label="Cancel" onClick={() => !pending && setOpen(false)} />
          <div className="relative w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex gap-3">
              {confirm?.danger && <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-red-100 text-red-600"><AlertTriangle className="h-5 w-5" /></span>}
              <div className="min-w-0 flex-1">
                <h2 id="ab-title" className="text-base font-semibold text-slate-900">{confirm?.title ?? prompt?.label}</h2>
                {confirm?.body && <div className="mt-1 text-sm text-slate-600">{confirm.body}</div>}
              </div>
            </div>
            {prompt && (
              <div className="mt-4">
                {confirm && <label className="label" htmlFor="ab-reason">{prompt.label}</label>}
                <textarea id="ab-reason" autoFocus rows={3} className="input" placeholder={prompt.placeholder} value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
            )}
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" className="btn-secondary" disabled={pending} onClick={() => setOpen(false)}>Cancel</button>
              <button type="button" className={confirm?.danger ? "btn-danger" : "btn-primary"} disabled={pending || (!!prompt?.required && !reason.trim())} onClick={run}>
                {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                {confirm?.confirmLabel ?? "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Destructive action with a required confirmation step. */
export function ConfirmButton({ action, fields, children, className, title, body, confirmLabel = "Delete" }: {
  action: FormAction; fields?: Record<string, string>; children: React.ReactNode; className?: string; title: string; body?: React.ReactNode; confirmLabel?: string;
}) {
  return (
    <ActionButton action={action} fields={fields} className={className ?? "btn-sm btn border border-red-200 bg-white text-red-700 hover:bg-red-50"} confirm={{ title, body, confirmLabel, danger: true }}>
      {children}
    </ActionButton>
  );
}

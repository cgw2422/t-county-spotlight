"use client";
import { useState } from "react";
import { AlertTriangle, Check, Copy, Wand2 } from "lucide-react";
import { PasswordChecklist, PasswordField } from "@/components/account/password-fields";
import { generatePassword } from "@/lib/password-generator";

/**
 * Temporary password + confirm, with a "Generate secure password" button.
 * A generated password is shown once in a reveal box with Copy; it exists only
 * in this browser until the form is submitted and is never sent back by the
 * server. Remount (change `key`) to clear it.
 */
export function TempPasswordFields({ name = "tempPassword", confirmName = "tempConfirm", errors }: { name?: string; confirmName?: string; errors?: { password?: string; confirm?: string } }) {
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [generated, setGenerated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function generate() {
    const p = generatePassword(18);
    setPw(p);
    setConfirm(p);
    setGenerated(p);
    setCopied(false);
  }
  async function copy() {
    if (!generated) return;
    try {
      await navigator.clipboard.writeText(generated);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  const mismatch = confirm.length > 0 && confirm !== pw;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-slate-800">Temporary password</span>
        <button type="button" onClick={generate} className="btn-secondary btn-sm"><Wand2 className="h-4 w-4" aria-hidden /> Generate secure password</button>
      </div>
      {generated && generated === pw && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3" role="status">
          <p className="flex items-start gap-2 text-xs font-medium text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>Shown only once. Copy it now and share it securely (in person or by phone — never by email). It isn&apos;t stored and can&apos;t be viewed again.</span>
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 select-all break-all rounded-lg bg-white px-3 py-2 font-mono text-base tracking-wide text-navy-900 ring-1 ring-amber-200" aria-label="Generated temporary password">{generated}</code>
            <button type="button" onClick={copy} className="btn-secondary btn-sm shrink-0" aria-label="Copy temporary password">
              {copied ? <><Check className="h-4 w-4" aria-hidden /> Copied</> : <><Copy className="h-4 w-4" aria-hidden /> Copy</>}
            </button>
          </div>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <PasswordField name={name} label="Temporary password" autoComplete="new-password" required value={pw} onChange={(v) => { setPw(v); if (generated && v !== generated) setGenerated(null); }} error={errors?.password} />
          <PasswordChecklist password={pw} />
        </div>
        <PasswordField name={confirmName} label="Confirm temporary password" autoComplete="new-password" required value={confirm} onChange={setConfirm}
          error={errors?.confirm || (mismatch ? "Passwords don't match." : undefined)} />
      </div>
    </div>
  );
}

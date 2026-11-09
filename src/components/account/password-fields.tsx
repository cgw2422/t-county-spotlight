"use client";
import { useId, useState } from "react";
import { Check, Circle, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { isCommonPassword, passwordChecks, PASSWORD_MIN_LENGTH } from "@/lib/password-rules";

type BaseProps = {
  name: string;
  label: string;
  autoComplete?: string;
  required?: boolean;
  autoFocus?: boolean;
  error?: string;
  help?: React.ReactNode;
  value?: string;
  onChange?: (v: string) => void;
  minLength?: number;
  describedBy?: string;
  id?: string;
};

/** Password input with an accessible show/hide toggle. Controlled or uncontrolled. */
export function PasswordField({ name, label, autoComplete = "current-password", required, autoFocus, error, help, value, onChange, minLength, describedBy, id }: BaseProps) {
  const auto = useId();
  const fid = id ?? `pw-${auto}`;
  const [shown, setShown] = useState(false);
  const helpId = `${fid}-help`;
  const describe = [error || help ? helpId : null, describedBy].filter(Boolean).join(" ") || undefined;
  return (
    <div>
      <label htmlFor={fid} className="label">{label}</label>
      <div className="relative">
        <input
          id={fid}
          name={name}
          type={shown ? "text" : "password"}
          autoComplete={autoComplete}
          required={required}
          autoFocus={autoFocus}
          minLength={minLength}
          maxLength={200}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          {...(value !== undefined ? { value, onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange?.(e.target.value) } : {})}
          aria-invalid={error ? true : undefined}
          aria-describedby={describe}
          className={cn("input pr-12", error && "border-red-400")}
        />
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-pressed={shown}
          aria-label={shown ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-controls={fid}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-slate-500 hover:text-navy-900 focus-visible:outline-2 focus-visible:outline-brand-600"
        >
          {shown ? <EyeOff className="h-5 w-5" aria-hidden /> : <Eye className="h-5 w-5" aria-hidden />}
        </button>
      </div>
      {(error || help) && (
        <p id={helpId} className={error ? "mt-1 text-xs font-medium text-red-600" : "help"} role={error ? "alert" : undefined}>{error || help}</p>
      )}
    </div>
  );
}

/** Live checklist of the password rules (mirrors passwordProblem on the server). */
export function PasswordChecklist({ password, id, hideCommon }: { password: string; id?: string; hideCommon?: boolean }) {
  const checks = passwordChecks(password);
  const common = !hideCommon && password.length >= PASSWORD_MIN_LENGTH && isCommonPassword(password);
  return (
    <ul id={id} className="mt-2 space-y-1 text-xs" aria-label="Password requirements">
      {checks.map((c) => (
        <li key={c.id} className={cn("flex items-center gap-1.5", c.ok ? "text-emerald-700" : "text-slate-500")}>
          {c.ok ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Circle className="h-3.5 w-3.5" aria-hidden />}
          <span>{c.label}<span className="sr-only">{c.ok ? " — met" : " — not met yet"}</span></span>
        </li>
      ))}
      {common && <li className="font-medium text-red-600">That password is too common — choose something harder to guess.</li>}
    </ul>
  );
}

/**
 * "New password" + "Confirm password" pair with show/hide toggles, a live
 * requirements checklist and inline mismatch/weak messages. The server
 * (passwordProblem) stays authoritative; these hints only help people type.
 */
export function NewPasswordFields({
  name = "password",
  confirmName = "confirm",
  label = "New password",
  confirmLabel = "Confirm password",
  errors,
  autoFocus,
  value,
  onChange,
}: {
  name?: string;
  confirmName?: string;
  label?: string;
  confirmLabel?: string;
  errors?: { password?: string; confirm?: string };
  autoFocus?: boolean;
  /** Optional controlled value (e.g. filled by a password generator). */
  value?: string;
  onChange?: (v: string) => void;
}) {
  const [inner, setInner] = useState("");
  const pw = value ?? inner;
  const setPw = (v: string) => { if (value === undefined) setInner(v); onChange?.(v); };
  const [confirm, setConfirm] = useState("");
  const [touchedPw, setTouchedPw] = useState(false);
  const [touchedConfirm, setTouchedConfirm] = useState(false);
  const listId = useId();

  // Server errors describe the value that was submitted; hide them once the user edits that field.
  const [prevErrors, setPrevErrors] = useState(errors);
  const [editedPw, setEditedPw] = useState(false);
  const [editedConfirm, setEditedConfirm] = useState(false);
  if (prevErrors !== errors) { setPrevErrors(errors); setEditedPw(false); setEditedConfirm(false); }
  const serverPw = editedPw ? undefined : errors?.password;
  const serverConfirm = editedConfirm ? undefined : errors?.confirm;

  const weak = pw.length > 0 && passwordChecks(pw).some((c) => !c.ok);
  const mismatch = confirm.length > 0 && confirm !== pw;
  const pwError = serverPw || (touchedPw && weak ? "This password doesn't meet the requirements below yet." : undefined);
  const confirmError = serverConfirm || ((touchedConfirm || confirm.length >= pw.length) && mismatch ? "Passwords don't match." : undefined);

  return (
    <div className="space-y-4">
      <div onBlur={() => setTouchedPw(true)}>
        <PasswordField name={name} label={label} autoComplete="new-password" required autoFocus={autoFocus} minLength={PASSWORD_MIN_LENGTH}
          value={pw} onChange={(v) => { setPw(v); setEditedPw(true); }} error={pwError} describedBy={`${listId}-rules`} />
        <PasswordChecklist password={pw} id={`${listId}-rules`} hideCommon={!!pwError} />
      </div>
      <div onBlur={() => setTouchedConfirm(true)}>
        <PasswordField name={confirmName} label={confirmLabel} autoComplete="new-password" required minLength={PASSWORD_MIN_LENGTH}
          value={confirm} onChange={(v) => { setConfirm(v); setEditedConfirm(true); }} error={confirmError}
          help={!mismatch && confirm.length > 0 && confirm === pw ? "Passwords match." : undefined} />
      </div>
    </div>
  );
}

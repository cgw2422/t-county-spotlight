import { cn } from "@/lib/utils";
import type { ActionState } from "@/components/ui/form-message";

/** ActionState plus echoed form values. */
export type FormState = (NonNullable<ActionState> & { values?: Echo }) | null;

type Common = { label: string; name: string; hint?: React.ReactNode; error?: string; className?: string; required?: boolean };

export function TextField({ label, name, hint, error, className, required, ...rest }: Common & Omit<React.InputHTMLAttributes<HTMLInputElement>, "name">) {
  const id = `f-${name}`;
  return (
    <div className={className}>
      <label htmlFor={id} className="label">{label}{!required && <span className="font-normal text-slate-400"> (optional)</span>}</label>
      <input id={id} name={name} required={required} className={cn("input", error && "border-red-400")} aria-invalid={error ? true : undefined} aria-describedby={`${id}-d`} {...rest} />
      {(error || hint) && <p id={`${id}-d`} className={error ? "mt-1 text-sm text-red-600" : "help text-sm"}>{error || hint}</p>}
    </div>
  );
}

export function TextArea({ label, name, hint, error, className, required, ...rest }: Common & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "name">) {
  const id = `f-${name}`;
  return (
    <div className={className}>
      <label htmlFor={id} className="label">{label}{!required && <span className="font-normal text-slate-400"> (optional)</span>}</label>
      <textarea id={id} name={name} required={required} className={cn("input min-h-32 leading-relaxed", error && "border-red-400")} aria-invalid={error ? true : undefined} aria-describedby={`${id}-d`} {...rest} />
      {(error || hint) && <p id={`${id}-d`} className={error ? "mt-1 text-sm text-red-600" : "help text-sm"}>{error || hint}</p>}
    </div>
  );
}

export function Checkbox({ label, name, defaultChecked, hint }: { label: string; name: string; defaultChecked?: boolean; hint?: string }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-start gap-3 py-2">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300 text-brand-600" />
      <span className="text-sm"><span className="font-medium text-navy-900">{label}</span>{hint && <span className="block text-slate-500">{hint}</span>}</span>
    </label>
  );
}

export function FormSection({ id, title, description, children }: { id?: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="card scroll-mt-24 p-5 sm:p-6">
      <h2 className="text-lg font-semibold text-navy-900">{title}</h2>
      {description && <p className="mt-1 text-sm text-slate-600">{description}</p>}
      <div className="mt-5 space-y-5">{children}</div>
    </section>
  );
}

/** Submitted values echoed back by an action so fields survive React's post-action form reset. */
export type Echo = Record<string, string | string[]>;

export function echoValues(fd: FormData, omit: string[] = []): Echo {
  const out: Echo = {};
  for (const [k, v] of fd.entries()) {
    if (typeof v !== "string" || k.startsWith("$ACTION") || omit.includes(k)) continue;
    const prev = out[k];
    out[k] = prev === undefined ? v : Array.isArray(prev) ? [...prev, v] : [prev, v];
  }
  return out;
}

/** Read an echoed value, falling back to the original. */
export function echoed(values: Echo | undefined, name: string, fallback: string): string {
  const v = values?.[name];
  return typeof v === "string" ? v : Array.isArray(v) ? v[0] ?? fallback : fallback;
}

export function echoedChecked(values: Echo | undefined, name: string, fallback: boolean, value = "on"): boolean {
  if (!values) return fallback;
  const v = values[name];
  return Array.isArray(v) ? v.includes(value) : v === value;
}

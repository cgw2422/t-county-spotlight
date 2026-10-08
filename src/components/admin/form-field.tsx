import { cn } from "@/lib/utils";

/** Label + control + help/error wrapper. Children is the control. */
export function Field({ label, htmlFor, help, error, required, children, className }: {
  label?: React.ReactNode; htmlFor?: string; help?: React.ReactNode; error?: string; required?: boolean; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={className}>
      {label && (
        <label htmlFor={htmlFor} className="label">
          {label}
          {required && <span className="ml-0.5 text-red-600" aria-hidden>*</span>}
        </label>
      )}
      {children}
      {error ? <p className="mt-1 text-xs font-medium text-red-600">{error}</p> : help ? <p className="help">{help}</p> : null}
    </div>
  );
}

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & { label?: React.ReactNode; help?: React.ReactNode; error?: string; wrapClassName?: string };

export function TextField({ label, help, error, wrapClassName, className, id, ...rest }: InputProps) {
  const fid = id ?? (rest.name ? `f-${rest.name}` : undefined);
  return (
    <Field label={label} htmlFor={fid} help={help} error={error} required={rest.required} className={wrapClassName}>
      <input id={fid} {...rest} className={cn("input", error && "border-red-400", className)} aria-invalid={!!error || undefined} />
    </Field>
  );
}

export function TextArea({ label, help, error, wrapClassName, className, id, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: React.ReactNode; help?: React.ReactNode; error?: string; wrapClassName?: string }) {
  const fid = id ?? (rest.name ? `f-${rest.name}` : undefined);
  return (
    <Field label={label} htmlFor={fid} help={help} error={error} required={rest.required} className={wrapClassName}>
      <textarea id={fid} rows={4} {...rest} className={cn("input min-h-24", className)} />
    </Field>
  );
}

export function SelectField({ label, help, error, wrapClassName, className, id, options, placeholder, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement> & {
  label?: React.ReactNode; help?: React.ReactNode; error?: string; wrapClassName?: string; options: (string | { value: string; label: string })[]; placeholder?: string;
}) {
  const fid = id ?? (rest.name ? `f-${rest.name}` : undefined);
  return (
    <Field label={label} htmlFor={fid} help={help} error={error} required={rest.required} className={wrapClassName}>
      <select id={fid} {...rest} className={cn("input", className)}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => {
          const v = typeof o === "string" ? { value: o, label: o } : o;
          return <option key={v.value} value={v.value}>{v.label}</option>;
        })}
      </select>
    </Field>
  );
}

export function Checkbox({ label, help, className, ...rest }: React.InputHTMLAttributes<HTMLInputElement> & { label: React.ReactNode; help?: React.ReactNode }) {
  return (
    <label className={cn("flex min-h-11 cursor-pointer items-start gap-3 rounded-lg py-2", className)}>
      <input type="checkbox" {...rest} className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300 text-brand-600 accent-brand-600 focus:ring-brand-500" />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-800">{label}</span>
        {help && <span className="block text-xs text-slate-500">{help}</span>}
      </span>
    </label>
  );
}

export function FormGrid({ children, cols = 2, className }: { children: React.ReactNode; cols?: 1 | 2 | 3 | 4; className?: string }) {
  const c = { 1: "", 2: "sm:grid-cols-2", 3: "sm:grid-cols-2 lg:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4" }[cols];
  return <div className={cn("grid gap-4", c, className)}>{children}</div>;
}

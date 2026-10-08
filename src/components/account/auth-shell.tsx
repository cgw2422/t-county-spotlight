import { OhioMark } from "@/components/site/logo";

/** Centered, app-like card used by sign-in / register / password pages. */
export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="bg-gradient-to-b from-brand-50/70 to-white">
      <div className="container-page flex justify-center py-8 sm:py-14">
        <div className="w-full max-w-md">
          <div className="card p-6 sm:p-8">
            <div className="mb-6 flex flex-col items-center text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-navy-800 text-white shadow-sm">
                <OhioMark className="h-8 w-8" />
              </span>
              <h1 className="mt-4 font-display text-2xl font-semibold text-navy-900 sm:text-3xl">{title}</h1>
              {subtitle && <p className="mt-2 text-sm text-slate-600">{subtitle}</p>}
            </div>
            {children}
          </div>
          {footer && <div className="mt-6 text-center text-sm text-slate-600">{footer}</div>}
        </div>
      </div>
    </div>
  );
}

export function Field({ label, name, type = "text", autoComplete, required, defaultValue, help, error, inputMode, maxLength, minLength, autoFocus, placeholder }: {
  label: string; name: string; type?: string; autoComplete?: string; required?: boolean; defaultValue?: string; help?: string; error?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"]; maxLength?: number; minLength?: number; autoFocus?: boolean; placeholder?: string;
}) {
  const id = `f-${name}`;
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      <input
        id={id} name={name} type={type} autoComplete={autoComplete} required={required} defaultValue={defaultValue}
        inputMode={inputMode} maxLength={maxLength} minLength={minLength} autoFocus={autoFocus} placeholder={placeholder}
        aria-invalid={error ? true : undefined} aria-describedby={help || error ? `${id}-help` : undefined}
        className="input"
      />
      {(error || help) && <p id={`${id}-help`} className={error ? "mt-1 text-xs text-red-600" : "help"}>{error || help}</p>}
    </div>
  );
}

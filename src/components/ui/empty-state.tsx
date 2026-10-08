import type { LucideIcon } from "lucide-react";

export function EmptyState({ icon: Icon, title, children }: { icon?: LucideIcon; title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 px-6 py-12 text-center">
      {Icon && <Icon className="mx-auto h-10 w-10 text-slate-400" aria-hidden />}
      <p className="mt-3 font-semibold text-slate-800">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-md text-sm text-slate-600">{children}</div>}
    </div>
  );
}

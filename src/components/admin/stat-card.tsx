import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatCard({ label, value, icon: Icon, href, hint, tone = "blue" }: {
  label: string; value: number | string; icon: LucideIcon; href?: string; hint?: string; tone?: "blue" | "amber" | "green" | "navy" | "orange";
}) {
  const toneCls = {
    blue: "bg-brand-50 text-brand-600", amber: "bg-amber-50 text-amber-600", green: "bg-emerald-50 text-emerald-600",
    navy: "bg-slate-100 text-navy-800", orange: "bg-orange-50 text-sunset-600",
  }[tone];
  const body = (
    <div className="flex flex-col items-start gap-2 sm:flex-row sm:gap-3">
      <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", toneCls)}><Icon className="h-5 w-5" aria-hidden /></span>
      <div className="min-w-0">
        <p className="text-[13px] font-medium leading-tight text-slate-500">{label}</p>
        <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-navy-950">{typeof value === "number" ? value.toLocaleString() : value}</p>
        {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
      </div>
    </div>
  );
  return href ? (
    <Link href={href} className="card block p-3.5 transition sm:p-4 hover:border-brand-200 hover:shadow-md">{body}</Link>
  ) : (
    <div className="card p-3.5 sm:p-4">{body}</div>
  );
}

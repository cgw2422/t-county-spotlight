import { AlertTriangle, BadgeCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { KIND_LABEL, ORG_STATUS_LABEL, URGENCY_BADGE, URGENCY_LABEL } from "@/lib/gives/constants";

const ORG_STATUS_TONE: Record<string, string> = { PENDING: "badge-amber", APPROVED: "badge-green", REJECTED: "badge-red", SUSPENDED: "badge-red", ARCHIVED: "badge-gray" };

export function OrgStatusBadge({ status, className }: { status: string; className?: string }) {
  return <span className={cn(ORG_STATUS_TONE[status] ?? "badge-gray", "whitespace-nowrap", className)}>{ORG_STATUS_LABEL[status] ?? status}</span>;
}

export function VerifiedBadge({ className, onDark }: { className?: string; onDark?: boolean }) {
  return (
    <span className={cn("badge whitespace-nowrap", onDark ? "bg-white/95 text-brand-700 shadow-sm" : "bg-brand-50 text-brand-700 ring-1 ring-brand-200", className)} title="Verified by the T-County Gives team">
      <BadgeCheck className="h-3.5 w-3.5" aria-hidden /> Verified
    </span>
  );
}

export function KindBadge({ kind, className }: { kind: string; className?: string }) {
  const tone = kind === "CHURCH" ? "bg-violet-50 text-violet-700" : kind === "COMMUNITY_GROUP" ? "bg-teal-50 text-teal-700" : "bg-orange-50 text-orange-700";
  return <span className={cn("badge whitespace-nowrap", tone, className)}>{KIND_LABEL[kind] ?? kind}</span>;
}

export function UrgencyBadge({ urgency, className }: { urgency: string; className?: string }) {
  return (
    <span className={cn(URGENCY_BADGE[urgency] ?? "badge-gray", "whitespace-nowrap", className)}>
      {urgency === "CRITICAL" && <AlertTriangle className="h-3 w-3" aria-hidden />}
      {URGENCY_LABEL[urgency] ?? urgency} need
    </span>
  );
}

/** Quantity progress (confirmed received ÷ needed). Only rendered when a quantity goal exists. */
export function NeedProgress({ received, needed, unit, pledged, compact }: { received: number; needed: number | null; unit?: string | null; pledged?: number; compact?: boolean }) {
  if (!needed) {
    return pledged ? <p className="text-sm text-slate-600">{pledged} pledged</p> : null;
  }
  const pct = Math.min(100, Math.round((received / needed) * 100));
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-semibold text-navy-900">{received.toLocaleString()} of {needed.toLocaleString()}{unit ? ` ${unit}` : ""} received</span>
        {!compact && <span className="text-slate-500">{pct}%</span>}
      </div>
      <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={needed} aria-valuenow={received} aria-label={`${received} of ${needed} received`}>
        <div className={cn("h-full rounded-full", pct >= 100 ? "bg-emerald-500" : "bg-sunset-500")} style={{ width: `${pct}%` }} />
      </div>
      {!!pledged && <p className="mt-1 text-xs text-slate-500">{pledged.toLocaleString()} pledged so far</p>}
    </div>
  );
}

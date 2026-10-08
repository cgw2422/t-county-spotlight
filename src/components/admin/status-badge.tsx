import { cn } from "@/lib/utils";

const TONES: Record<string, string> = {
  PUBLISHED: "badge-green", ACTIVE: "badge-green", APPROVED: "badge-green", Active: "badge-green", TRIALING: "badge-green", paid: "badge-green", succeeded: "badge-green",
  DRAFT: "badge-gray", UNPUBLISHED: "badge-gray", ARCHIVED: "badge-gray", Draft: "badge-gray", Unpublished: "badge-gray", Expired: "badge-gray", CANCELED: "badge-gray", INCOMPLETE: "badge-gray", Hidden: "badge-gray",
  PENDING: "badge-amber", "Pending approval": "badge-amber", PAST_DUE: "badge-amber", open: "badge-amber",
  SCHEDULED: "badge-blue", Scheduled: "badge-blue", Upcoming: "badge-blue",
  REJECTED: "badge-red", SUSPENDED: "badge-red", Rejected: "badge-red", UNPAID: "badge-red", DELETED: "badge-red", failed: "badge-red", Trash: "badge-red",
};

export function humanize(s: string) {
  if (/[a-z]/.test(s)) return s;
  return s.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

export function StatusBadge({ status, label, className }: { status: string; label?: string; className?: string }) {
  return <span className={cn(TONES[status] ?? "badge-gray", "whitespace-nowrap", className)}>{label ?? humanize(status)}</span>;
}

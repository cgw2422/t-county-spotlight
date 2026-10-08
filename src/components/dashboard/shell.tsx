import Link from "next/link";
import { ArrowLeft, ExternalLink, Lightbulb } from "lucide-react";
import { OhioMark } from "@/components/site/logo";
import { LogoutButton } from "@/components/account/logout-button";
import { BusinessSwitcher, MobileNav, SidebarNav, type DashNavItem } from "./nav";
import { cn } from "@/lib/utils";

function Brand({ sub }: { sub?: string }) {
  return (
    <Link href="/dashboard/" className="flex items-center gap-2.5 text-white">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10"><OhioMark className="h-6 w-6" /></span>
      <span className="leading-tight">
        <span className="block text-[15px] font-extrabold tracking-tight">TCounty<span className="text-sunset-400">Spotlight</span></span>
        <span className="block text-xs text-slate-300">{sub ?? "Business dashboard"}</span>
      </span>
    </Link>
  );
}

/** Dashboard frame without business navigation (picker / claim screens). */
export function PlainShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-slate-50">
      <header className="bg-navy-900 pt-safe">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-4">
          <Brand />
          <Link href="/" className="flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-slate-200 hover:bg-white/10 hover:text-white"><ArrowLeft className="h-4 w-4" /> Back to site</Link>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-5xl px-4 py-8 pb-safe">{children}</main>
    </div>
  );
}

export function DashboardShell({ children, items, root, business, businesses, publicHref, userName }: {
  children: React.ReactNode; items: DashNavItem[]; root: string;
  business: { id: string; name: string; status: string }; businesses: { id: string; name: string }[];
  publicHref: string | null; userName: string;
}) {
  return (
    <div className="min-h-dvh bg-slate-50 lg:pl-72">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 flex-col gap-6 overflow-y-auto bg-navy-900 p-5 lg:flex">
        <Brand />
        <div className="rounded-xl bg-white/5 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Managing</p>
          <p className="mt-0.5 font-semibold text-white">{business.name}</p>
          {publicHref && <Link href={publicHref} className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-sunset-400 hover:underline">View public page <ExternalLink className="h-3 w-3" /></Link>}
          {businesses.length > 1 && <div className="mt-3"><BusinessSwitcher businesses={businesses} currentId={business.id} /></div>}
        </div>
        <nav aria-label="Dashboard"><SidebarNav items={items} root={root} /></nav>
        <div className="mt-auto space-y-2 border-t border-white/10 pt-4">
          <Link href="/" className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-medium text-slate-200 hover:bg-white/10 hover:text-white"><ArrowLeft className="h-4 w-4" /> Back to site</Link>
          <p className="px-3 text-xs text-slate-400">Signed in as {userName}</p>
          <LogoutButton className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-sm font-medium text-slate-200 hover:bg-white/10 hover:text-white" />
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 bg-navy-900 pt-safe lg:hidden">
        <div className="flex h-14 items-center gap-2 px-2">
          <MobileNav items={items} root={root} title={business.name} businesses={businesses} currentId={business.id} />
          <p className="min-w-0 flex-1 truncate font-semibold text-white">{business.name}</p>
          <Link href="/" className="flex min-h-11 items-center gap-1 rounded-lg px-3 text-sm text-slate-200 hover:bg-white/10" aria-label="Back to site"><ArrowLeft className="h-4 w-4" /> Site</Link>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-5xl px-4 pb-28 pt-6 sm:px-6 lg:px-10 lg:pb-12 lg:pt-10">{children}</main>
    </div>
  );
}

export function PageHeader({ title, description, action }: { title: string; description?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-display text-2xl font-semibold text-navy-900 sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-slate-600">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function Hint({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex gap-3 rounded-xl border border-brand-100 bg-brand-50/60 p-4 text-sm text-navy-900", className)}>
      <Lightbulb className="h-5 w-5 shrink-0 text-brand-600" aria-hidden />
      <div>{children}</div>
    </div>
  );
}

export function Panel({ title, description, children, className }: { title?: string; description?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("card p-5 sm:p-6", className)}>
      {title && <h2 className="text-lg font-semibold text-navy-900">{title}</h2>}
      {description && <p className="mt-1 text-sm text-slate-600">{description}</p>}
      <div className={title || description ? "mt-4" : undefined}>{children}</div>
    </section>
  );
}

const STATUS: Record<string, [string, string]> = {
  DRAFT: ["Draft", "badge-gray"],
  PENDING: ["Waiting for review", "badge-amber"],
  PUBLISHED: ["Live", "badge-green"],
  APPROVED: ["Approved", "badge-green"],
  REJECTED: ["Not approved", "badge-red"],
  UNPUBLISHED: ["Unpublished", "badge-gray"],
  ARCHIVED: ["Archived", "badge-gray"],
  SUSPENDED: ["Suspended", "badge-red"],
  "Pending approval": ["Waiting for review", "badge-amber"],
  Scheduled: ["Scheduled", "badge-blue"],
  Active: ["Active", "badge-green"],
  Expired: ["Expired", "badge-gray"],
  Draft: ["Draft", "badge-gray"],
  Rejected: ["Not approved", "badge-red"],
  Unpublished: ["Unpublished", "badge-gray"],
};

export function StatusBadge({ status }: { status: string }) {
  const [label, cls] = STATUS[status] ?? [status, "badge-gray"];
  return <span className={cls}>{label}</span>;
}

/** Shown in place of a paid feature when the plan doesn't include it. */
export function Upsell({ businessId, feature }: { businessId: string; feature: string }) {
  return (
    <div className="card overflow-hidden">
      <div className="bg-gradient-to-br from-navy-800 to-brand-700 p-6 text-white sm:p-8">
        <p className="eyebrow text-sunset-400">Membership feature</p>
        <h2 className="mt-2 font-display text-2xl font-semibold">{feature} are part of a paid membership</h2>
        <p className="mt-2 max-w-xl text-slate-200">Upgrade your listing to unlock {feature.toLowerCase()} and more. Memberships never buy editorial coverage — they add tools for your listing.</p>
        <Link href={`/dashboard/${businessId}/membership/`} className="btn-accent mt-5">See membership options</Link>
      </div>
    </div>
  );
}

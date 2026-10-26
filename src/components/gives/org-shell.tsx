import Link from "next/link";
import { ArrowLeft, ExternalLink, HeartHandshake } from "lucide-react";
import { LogoutButton } from "@/components/account/logout-button";
import { OrgMobileNav, OrgSidebarNav, OrgSwitcher, type OrgNavItem } from "./org-nav";

function Brand() {
  return (
    <Link href="/organization/" className="flex items-center gap-2.5 text-white">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sunset-500"><HeartHandshake className="h-5 w-5" aria-hidden /></span>
      <span className="leading-tight">
        <span className="block text-[15px] font-extrabold tracking-tight">T-County <span className="text-sunset-400">Gives</span></span>
        <span className="block text-xs text-slate-300">Organization dashboard</span>
      </span>
    </Link>
  );
}

/** Frame without organization navigation (picker / empty state). */
export function OrgPlainShell({ children }: { children: React.ReactNode }) {
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

export function OrgShell({ children, items, root, org, orgs, publicHref, userName }: {
  children: React.ReactNode; items: OrgNavItem[]; root: string;
  org: { id: string; name: string }; orgs: { id: string; name: string }[]; publicHref: string | null; userName: string;
}) {
  return (
    <div className="min-h-dvh bg-slate-50 lg:pl-72">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 flex-col gap-6 overflow-y-auto bg-navy-900 p-5 lg:flex">
        <Brand />
        <div className="rounded-xl bg-white/5 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Managing</p>
          <p className="mt-0.5 font-semibold text-white">{org.name}</p>
          {publicHref && <Link href={publicHref} className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-sunset-400 hover:underline">View public page <ExternalLink className="h-3 w-3" /></Link>}
          {orgs.length > 1 && <div className="mt-3"><OrgSwitcher orgs={orgs} currentId={org.id} /></div>}
        </div>
        <nav aria-label="Organization dashboard"><OrgSidebarNav items={items} root={root} /></nav>
        <div className="mt-auto space-y-2 border-t border-white/10 pt-4">
          <Link href="/" className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-medium text-slate-200 hover:bg-white/10 hover:text-white"><ArrowLeft className="h-4 w-4" /> Back to site</Link>
          <p className="px-3 text-xs text-slate-400">Signed in as {userName}</p>
          <LogoutButton className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-sm font-medium text-slate-200 hover:bg-white/10 hover:text-white" />
        </div>
      </aside>

      <header className="sticky top-0 z-30 bg-navy-900 pt-safe lg:hidden">
        <div className="flex h-14 items-center gap-2 px-2">
          <OrgMobileNav items={items} root={root} title={org.name} orgs={orgs} currentId={org.id} />
          <p className="min-w-0 flex-1 truncate font-semibold text-white">{org.name}</p>
          <Link href="/" className="flex min-h-11 items-center gap-1 rounded-lg px-3 text-sm text-slate-200 hover:bg-white/10" aria-label="Back to site"><ArrowLeft className="h-4 w-4" /> Site</Link>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-5xl px-4 pb-28 pt-6 sm:px-6 lg:px-10 lg:pb-12 lg:pt-10">{children}</main>
    </div>
  );
}

"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, FileText, FileStack, Image as ImageIcon, Store, ClipboardList, Tags, Megaphone, Briefcase,
  CalendarDays, CalendarCog, BadgePercent, Home, Sparkles, Menu as MenuIcon, ArrowRightLeft, Users, CreditCard,
  Settings, ScrollText, DatabaseZap, ChevronsLeft, ChevronsRight, X, Menu, ExternalLink, LogOut, ShieldCheck, ChevronDown,
  type LucideIcon,
} from "lucide-react";
import { OhioMark } from "@/components/site/logo";
import { cn } from "@/lib/utils";
import { signOutAction } from "@/app/admin/_actions/common";

type NavItem = { href: string; label: string; icon: LucideIcon; adminOnly?: boolean; badge?: keyof Counts };
type Counts = { applications: number; events: number; specials: number; updates: number; articles: number; jobs: number };

const NAV: { title: string; items: NavItem[] }[] = [
  { title: "Overview", items: [{ href: "/admin/", label: "Dashboard", icon: LayoutDashboard }] },
  {
    title: "Content",
    items: [
      { href: "/admin/articles/", label: "Articles", icon: FileText, badge: "articles" },
      { href: "/admin/pages/", label: "Pages", icon: FileStack },
      { href: "/admin/media/", label: "Media library", icon: ImageIcon },
    ],
  },
  {
    title: "Directory",
    items: [
      { href: "/admin/businesses/", label: "Businesses", icon: Store },
      { href: "/admin/applications/", label: "Applications", icon: ClipboardList, badge: "applications" },
      { href: "/admin/businesses/categories/", label: "Business categories", icon: Tags },
      { href: "/admin/updates/", label: "Business updates", icon: Megaphone, badge: "updates" },
      { href: "/admin/jobs/", label: "Jobs", icon: Briefcase, badge: "jobs" },
    ],
  },
  {
    title: "Events & specials",
    items: [
      { href: "/admin/events/", label: "Events", icon: CalendarDays, badge: "events" },
      { href: "/admin/events/categories/", label: "Event categories", icon: CalendarCog },
      { href: "/admin/specials/", label: "Specials", icon: BadgePercent, badge: "specials" },
    ],
  },
  {
    title: "Site",
    items: [
      { href: "/admin/homepage/", label: "Homepage", icon: Home },
      { href: "/admin/placements/", label: "Sponsored placements", icon: Sparkles },
      { href: "/admin/menus/", label: "Menus", icon: MenuIcon, adminOnly: true },
      { href: "/admin/redirects/", label: "Redirects", icon: ArrowRightLeft },
    ],
  },
  {
    title: "Administration",
    items: [
      { href: "/admin/users/", label: "Users", icon: Users, adminOnly: true },
      { href: "/admin/memberships/", label: "Memberships", icon: CreditCard, adminOnly: true },
      { href: "/admin/settings/", label: "Settings", icon: Settings, adminOnly: true },
      { href: "/admin/audit/", label: "Audit log", icon: ScrollText, adminOnly: true },
      { href: "/admin/migration/", label: "WordPress Import", icon: DatabaseZap, adminOnly: true },
    ],
  },
];

export type ShellProps = {
  children: React.ReactNode;
  user: { name: string | null; email: string; role: string };
  isAdmin: boolean;
  siteName: string;
  logoUrl: string | null;
  logoOnDark?: boolean;
  counts: Counts;
};

function activeHref(path: string) {
  const p = path.endsWith("/") ? path : path + "/";
  let best = "";
  for (const g of NAV) for (const i of g.items) if (p.startsWith(i.href) && i.href.length > best.length) best = i.href;
  return best;
}

function SidebarNav({ path, isAdmin, counts, collapsed, onNavigate }: { path: string; isAdmin: boolean; counts: Counts; collapsed: boolean; onNavigate?: () => void }) {
  const current = activeHref(path);
  return (
    <nav aria-label="Admin" className="flex-1 overflow-y-auto px-3 py-4 [scrollbar-color:rgba(255,255,255,0.15)_transparent] [scrollbar-width:thin]">
      {NAV.map((g) => {
        const items = g.items.filter((i) => isAdmin || !i.adminOnly);
        if (!items.length) return null;
        return (
          <div key={g.title} className="mb-5">
            {!collapsed && <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400/80">{g.title}</p>}
            {collapsed && <div className="mx-3 mb-2 border-t border-white/10" />}
            <ul className="space-y-0.5">
              {items.map((item) => {
                const active = item.href === current;
                const count = item.badge ? counts[item.badge] : 0;
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      title={collapsed ? item.label : undefined}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group relative flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                        active ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5 hover:text-white",
                        collapsed && "justify-center px-0",
                      )}
                    >
                      {active && <span className="absolute inset-y-1.5 left-0 w-1 rounded-r bg-sunset-400" aria-hidden />}
                      <Icon className={cn("h-[18px] w-[18px] shrink-0", active ? "text-white" : "text-slate-400 group-hover:text-white")} aria-hidden />
                      {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                      {count > 0 && (
                        <span
                          className={cn(
                            "rounded-full bg-sunset-500 text-[11px] font-bold text-white",
                            collapsed ? "absolute right-1.5 top-1 h-2 w-2 p-0 text-[0px]" : "px-1.5 py-0.5 leading-none",
                          )}
                          aria-label={`${count} pending`}
                        >
                          {count > 99 ? "99+" : count}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function Brand({ logoUrl, logoOnDark, siteName, collapsed }: { logoUrl: string | null; logoOnDark?: boolean; siteName: string; collapsed: boolean }) {
  return (
    <Link href="/admin/" className="flex min-w-0 items-center gap-2.5" aria-label={`${siteName} admin home`}>
      {logoUrl && !collapsed ? (
        <span className={logoOnDark ? "" : "rounded-md bg-white px-2 py-1"}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoUrl} alt={siteName} className="h-7 w-auto max-w-[150px] object-contain" />
        </span>
      ) : (
        <>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/10">
            <OhioMark className="h-6 w-6 text-white" />
          </span>
          {!collapsed && (
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-[15px] font-extrabold tracking-tight text-white">
                TCounty<span className="text-sunset-400">Spotlight</span>
              </span>
              <span className="block text-[11px] font-medium uppercase tracking-wider text-slate-400">Admin</span>
            </span>
          )}
        </>
      )}
    </Link>
  );
}

function UserMenu({ user }: { user: ShellProps["user"] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const path = usePathname();
  const [lastPath, setLastPath] = useState(path);
  if (path !== lastPath) { setLastPath(path); setOpen(false); }
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); window.removeEventListener("keydown", onKey); };
  }, [open]);
  const initials = (user.name || user.email).split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((s) => s[0]!.toUpperCase()).join("");
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu" className="flex min-h-11 items-center gap-2 rounded-lg px-1.5 hover:bg-slate-100 sm:px-2">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-navy-800 text-xs font-bold text-white">{initials}</span>
        <span className="hidden text-left leading-tight md:block">
          <span className="block max-w-[160px] truncate text-sm font-semibold text-slate-800">{user.name || user.email}</span>
          <span className="block text-xs capitalize text-slate-500">{user.role.toLowerCase()}</span>
        </span>
        <ChevronDown className="hidden h-4 w-4 text-slate-400 md:block" aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="truncate text-sm font-semibold text-slate-900">{user.name || "Signed in"}</p>
            <p className="truncate text-xs text-slate-500">{user.email}</p>
          </div>
          <Link role="menuitem" href="/admin/security/" className="flex min-h-11 items-center gap-2 px-4 text-sm text-slate-700 hover:bg-slate-50"><ShieldCheck className="h-4 w-4" /> Two-factor authentication</Link>
          <a role="menuitem" href="/" target="_blank" rel="noreferrer" className="flex min-h-11 items-center gap-2 px-4 text-sm text-slate-700 hover:bg-slate-50"><ExternalLink className="h-4 w-4" /> View site</a>
          <form action={signOutAction} className="border-t border-slate-100">
            <button type="submit" role="menuitem" className="flex min-h-11 w-full items-center gap-2 px-4 text-sm text-red-700 hover:bg-red-50"><LogOut className="h-4 w-4" /> Sign out</button>
          </form>
        </div>
      )}
    </div>
  );
}

const COLLAPSE_KEY = "tcs-admin-collapsed";
const COLLAPSE_EVENT = "tcs-admin-collapse";
function readCollapsed() {
  try { return localStorage.getItem(COLLAPSE_KEY) === "1"; } catch { return false; }
}
function subscribeCollapsed(cb: () => void) {
  window.addEventListener(COLLAPSE_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => { window.removeEventListener(COLLAPSE_EVENT, cb); window.removeEventListener("storage", cb); };
}

export function AdminShell({ children, user, isAdmin, siteName, logoUrl, logoOnDark, counts }: ShellProps) {
  const path = usePathname();
  const collapsed = useSyncExternalStore(subscribeCollapsed, readCollapsed, () => false);
  const [drawer, setDrawer] = useState(false);
  const [lastPath, setLastPath] = useState(path);
  if (path !== lastPath) { setLastPath(path); setDrawer(false); }
  useEffect(() => {
    if (!drawer) return;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawer(false);
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = ""; window.removeEventListener("keydown", onKey); };
  }, [drawer]);

  function toggleCollapsed() {
    try { localStorage.setItem(COLLAPSE_KEY, collapsed ? "0" : "1"); } catch {}
    window.dispatchEvent(new Event(COLLAPSE_EVENT));
  }

  return (
    <div className="min-h-dvh bg-slate-100/70">
      {/* Desktop sidebar */}
      <aside className={cn("fixed inset-y-0 left-0 z-30 hidden flex-col bg-navy-950 transition-[width] duration-200 lg:flex", collapsed ? "w-[72px]" : "w-64")}>
        <div className={cn("flex h-16 shrink-0 items-center border-b border-white/10", collapsed ? "justify-center px-2" : "px-5")}>
          <Brand logoUrl={logoUrl} logoOnDark={logoOnDark} siteName={siteName} collapsed={collapsed} />
        </div>
        <SidebarNav path={path} isAdmin={isAdmin} counts={counts} collapsed={collapsed} />
        <button
          type="button"
          onClick={toggleCollapsed}
          className={cn("flex min-h-12 items-center gap-2 border-t border-white/10 px-5 text-sm text-slate-400 hover:bg-white/5 hover:text-white", collapsed && "justify-center px-0")}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronsRight className="h-5 w-5" /> : <><ChevronsLeft className="h-5 w-5" /> Collapse</>}
        </button>
      </aside>

      {/* Mobile drawer */}
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Admin navigation">
          <button type="button" className="absolute inset-0 bg-slate-900/60" aria-label="Close menu" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-[85%] max-w-xs flex-col bg-navy-950 shadow-2xl pt-safe">
            <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 px-4">
              <Brand logoUrl={logoUrl} logoOnDark={logoOnDark} siteName={siteName} collapsed={false} />
              <button type="button" onClick={() => setDrawer(false)} className="grid h-11 w-11 place-items-center rounded-lg text-slate-300 hover:bg-white/10" aria-label="Close menu"><X className="h-5 w-5" /></button>
            </div>
            <SidebarNav path={path} isAdmin={isAdmin} counts={counts} collapsed={false} onNavigate={() => setDrawer(false)} />
          </aside>
        </div>
      )}

      <div className={cn("flex min-h-dvh flex-col transition-[padding] duration-200", collapsed ? "lg:pl-[72px]" : "lg:pl-64")}>
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur pt-safe">
          <div className="flex h-16 items-center gap-2 px-3 sm:px-6">
            <button type="button" onClick={() => setDrawer(true)} className="grid h-11 w-11 place-items-center rounded-lg text-slate-700 hover:bg-slate-100 lg:hidden" aria-label="Open menu">
              <Menu className="h-6 w-6" />
            </button>
            <Link href="/admin/" className="flex items-center gap-2 lg:hidden" aria-label="Admin home">
              <OhioMark className="h-7 w-7 text-navy-800" />
              <span className="text-[15px] font-extrabold tracking-tight text-navy-900">Admin</span>
            </Link>
            <div className="flex-1" />
            <a href="/" target="_blank" rel="noreferrer" className="btn-ghost btn-sm hidden sm:inline-flex"><ExternalLink className="h-4 w-4" /> View site</a>
            <UserMenu user={user} />
          </div>
        </header>
        <main id="main" className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}

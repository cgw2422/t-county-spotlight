"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowLeft, CalendarDays, CreditCard, Gauge, Images, Lock, Megaphone, Menu, PencilLine, Receipt, Tag, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LogoutButton } from "@/components/account/logout-button";

const ICONS = { overview: Gauge, profile: PencilLine, photos: Images, events: CalendarDays, specials: Tag, updates: Megaphone, membership: CreditCard, invoices: Receipt };
export type DashNavItem = { key: keyof typeof ICONS; href: string; label: string; locked?: boolean };

function isActive(path: string, href: string, root: string) {
  const p = path.endsWith("/") ? path : path + "/";
  return href === root ? p === root : p.startsWith(href);
}

function NavList({ items, root, onNavigate }: { items: DashNavItem[]; root: string; onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <ul className="space-y-1">
      {items.map((i) => {
        const Icon = ICONS[i.key];
        const active = isActive(path, i.href, root);
        return (
          <li key={i.href}>
            <Link href={i.href} onClick={onNavigate} aria-current={active ? "page" : undefined}
              className={cn("flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-medium transition-colors",
                active ? "bg-white text-navy-900 shadow-sm" : "text-slate-200 hover:bg-white/10 hover:text-white")}>
              <Icon className="h-5 w-5 shrink-0" aria-hidden />
              <span className="flex-1">{i.label}</span>
              {i.locked && <Lock className="h-4 w-4 opacity-60" aria-label="Upgrade required" />}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function BusinessSwitcher({ businesses, currentId }: { businesses: { id: string; name: string }[]; currentId: string }) {
  const router = useRouter();
  if (businesses.length < 2) return null;
  return (
    <div>
      <label htmlFor="biz-switch" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-300">Switch business</label>
      <select id="biz-switch" className="min-h-11 w-full rounded-lg border border-white/20 bg-white/10 px-3 text-sm text-white [&>option]:text-slate-900"
        value={currentId} onChange={(e) => router.push(`/dashboard/${e.target.value}/`)}>
        {businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
    </div>
  );
}

/** Desktop sidebar contents. */
export function SidebarNav({ items, root }: { items: DashNavItem[]; root: string }) {
  return <NavList items={items} root={root} />;
}

/** Mobile: menu button + slide-in drawer, and a bottom tab bar for the most-used pages. */
export function MobileNav({ items, root, title, businesses, currentId }: { items: DashNavItem[]; root: string; title: string; businesses: { id: string; name: string }[]; currentId: string }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const [lastPath, setLastPath] = useState(path);
  if (path !== lastPath) { setLastPath(path); setOpen(false); }
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open]);
  const tabs = items.filter((i) => ["overview", "profile", "photos", "events"].includes(i.key));
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-white hover:bg-white/10" aria-label="Open menu" aria-expanded={open} aria-controls="dash-drawer">
        <Menu className="h-6 w-6" />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Dashboard menu" id="dash-drawer">
          <button type="button" className="absolute inset-0 bg-navy-950/60" aria-label="Close menu" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-[85%] max-w-xs flex-col overflow-y-auto bg-navy-900 p-4 pt-[calc(1rem+var(--safe-top))] shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <p className="truncate font-semibold text-white">{title}</p>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-2 text-white hover:bg-white/10" aria-label="Close menu"><X className="h-6 w-6" /></button>
            </div>
            <div className="mb-4"><BusinessSwitcher businesses={businesses} currentId={currentId} /></div>
            <NavList items={items} root={root} onNavigate={() => setOpen(false)} />
            <div className="mt-auto space-y-1 border-t border-white/10 pt-4 pb-safe">
              <Link href="/" className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-medium text-slate-200 hover:text-white"><ArrowLeft className="h-4 w-4" /> Back to site</Link>
              <LogoutButton className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-sm font-medium text-slate-200 hover:text-white" />
            </div>
          </div>
        </div>
      )}
      <nav aria-label="Dashboard" className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-safe backdrop-blur lg:hidden">
        <ul className="grid grid-cols-5">
          {tabs.map((i) => {
            const Icon = ICONS[i.key];
            const active = isActive(path, i.href, root);
            return (
              <li key={i.href}>
                <Link href={i.href} aria-current={active ? "page" : undefined} className={cn("flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium", active ? "text-brand-600" : "text-slate-500")}>
                  <Icon className="h-5 w-5" aria-hidden /> {i.key === "overview" ? "Home" : i.key === "profile" ? "Profile" : i.label}
                </Link>
              </li>
            );
          })}
          <li>
            <button type="button" onClick={() => setOpen(true)} className="flex min-h-14 w-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-slate-500">
              <Menu className="h-5 w-5" aria-hidden /> More
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}

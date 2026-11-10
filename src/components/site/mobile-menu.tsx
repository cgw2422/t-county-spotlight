"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import type { NavItem } from "./nav-data";

const noopSubscribe = () => () => {};

// Menu items come from Admin → Menus; they're grouped by destination. Anything
// unrecognised lands in "More", so no admin-added link is ever dropped.
const GROUPS: { title: string; match: RegExp }[] = [
  { title: "Happening now", match: /^\/(events|food-trucks|garage-sales|things-to-do|specials)(\/|$)/ },
  { title: "Local", match: /^\/(businesses|jobs|new|communities|explore)(\/|$)/ },
  { title: "Community", match: /^\/(gives|churches|organizations|community-pulse|articles|announcements|spotlights)(\/|$)/ },
];

function groupItems(items: NavItem[]) {
  const groups = GROUPS.map((g) => ({ title: g.title, items: [] as NavItem[] }));
  const more: NavItem[] = [];
  let home: NavItem | null = null;
  for (const i of items) {
    if (i.href === "/" && !home) { home = i; continue; }
    const idx = GROUPS.findIndex((g) => g.match.test(i.href));
    (idx >= 0 ? groups[idx].items : more).push(i);
  }
  if (more.length) groups.push({ title: "More", items: more });
  return { home, groups: groups.filter((g) => g.items.length) };
}

const samePath = (a: string, b: string) => a.replace(/\/+$/, "") === b.replace(/\/+$/, "");

/**
 * Phone/tablet navigation menu.
 *
 * The panel is rendered into <body> with a portal: the sticky header uses
 * `backdrop-filter`, which makes it the containing block for `position: fixed`
 * children — a fixed panel inside the header would be clipped to the header's
 * 64px height and never visible.
 *
 * Layout: header stays visible on top (z-40); backdrop + panel sit between the
 * header and the bottom app bar (z-50), so neither the hero nor Community Pulse
 * content can cover them and the bottom navigation stays usable.
 */
export function MobileMenu({ items, signedIn, accountHref }: { items: NavItem[]; signedIn: boolean; accountHref: string }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const [openPath, setOpenPath] = useState(path);
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close after navigation (covers back/forward and links that change the route).
  if (open && openPath !== path) { setOpen(false); setOpenPath(path); }

  const close = useCallback((restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) buttonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const { body, documentElement } = document;
    const prevBody = body.style.overflow;
    const prevHtml = documentElement.style.overflow;
    body.style.overflow = "hidden";
    documentElement.style.overflow = "hidden"; // iOS Safari needs the root locked too
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(true); };
    // Close if the viewport grows to the desktop layout while open.
    const mq = window.matchMedia("(min-width: 1280px)");
    const onMq = () => { if (mq.matches) close(); };
    // Any tap outside the panel and its toggle button (header, bottom bar, backdrop) closes it.
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (!t || panelRef.current?.contains(t) || buttonRef.current?.contains(t)) return;
      close();
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    mq.addEventListener("change", onMq);
    panelRef.current?.querySelector<HTMLElement>("a,button")?.focus({ preventScroll: true });
    return () => {
      body.style.overflow = prevBody;
      documentElement.style.overflow = prevHtml;
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
      mq.removeEventListener("change", onMq);
    };
  }, [open, close]);

  const linkProps = { onClick: () => close() };
  const { home, groups } = groupItems(items);
  const linkCls = (active: boolean) =>
    `flex min-h-11 items-center rounded-lg px-3 text-[15px] font-medium ${active ? "bg-hillside-50 text-hillside-700" : "text-navy-900 hover:bg-slate-50 active:bg-slate-100"}`;

  return (
    <div className="xl:hidden">
      <button
        ref={buttonRef}
        type="button"
        className="btn-ghost relative z-10 px-3"
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => { setOpenPath(path); setOpen((o) => !o); }}
      >
        {open ? <X className="h-6 w-6" aria-hidden /> : <Menu className="h-6 w-6" aria-hidden />}
      </button>
      {mounted && open && createPortal(
        <>
          <div
            aria-hidden
            className="fixed inset-x-0 top-[calc(4rem+var(--safe-top))] bottom-[calc(3.5rem+var(--safe-bottom))] z-50 bg-navy-950/40 lg:top-[calc(72px+var(--safe-top))] lg:bottom-0 xl:hidden"
          />
          <div
            ref={panelRef}
            id="mobile-menu"
            className="fixed inset-x-0 top-[calc(4rem+var(--safe-top))] z-50 max-h-[calc(100dvh-4rem-var(--safe-top)-3.5rem-var(--safe-bottom))] overflow-y-auto overscroll-contain rounded-b-2xl border-t border-slate-200 bg-white shadow-xl lg:top-[calc(72px+var(--safe-top))] lg:max-h-[calc(100dvh-72px-var(--safe-top))] xl:hidden"
          >
            <nav aria-label="Mobile" className="container-page py-3">
              {home && (
                <Link href={home.href} aria-current={samePath(home.href, path) ? "page" : undefined} className={linkCls(samePath(home.href, path))} {...linkProps}>
                  {home.label}
                </Link>
              )}
              {groups.map((g) => (
                <section key={g.title} aria-labelledby={`mm-${g.title}`} className="mt-3 first:mt-0">
                  <h2 id={`mm-${g.title}`} className="px-3 pb-1 font-display text-[11px] font-bold uppercase tracking-wider text-slate-500">{g.title}</h2>
                  <ul className="grid grid-cols-2 gap-x-2">
                    {g.items.map((i) => (
                      <li key={i.href + i.label}>
                        <Link
                          href={i.href}
                          target={i.newTab ? "_blank" : undefined}
                          aria-current={samePath(i.href, path) ? "page" : undefined}
                          className={linkCls(samePath(i.href, path))}
                          {...linkProps}
                        >
                          {i.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
              <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-4">
                <Link href="/my-t-county/" className="btn-secondary btn-sm min-h-11 w-full" {...linkProps}>My T County</Link>
                {signedIn ? (
                  <Link href={accountHref} className="btn-primary btn-sm min-h-11 w-full" {...linkProps}>My Account</Link>
                ) : (
                  <Link href="/login/" className="btn-primary btn-sm min-h-11 w-full" {...linkProps}>Sign In</Link>
                )}
                {!signedIn && <Link href="/register/" className="btn-ghost btn-sm min-h-11 w-full" {...linkProps}>Create free account</Link>}
                <Link href="/list-your-business/" className={`btn-ghost btn-sm min-h-11 w-full${signedIn ? " col-span-2" : ""}`} {...linkProps}>List your business</Link>
              </div>
            </nav>
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}

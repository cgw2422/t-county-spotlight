"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import type { NavItem } from "./nav-data";

const noopSubscribe = () => () => {};

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
            className="fixed inset-x-0 top-[calc(4rem+var(--safe-top))] z-50 max-h-[calc(100dvh-4rem-var(--safe-top)-3.5rem-var(--safe-bottom))] overflow-y-auto overscroll-contain border-t border-slate-200 bg-white shadow-xl lg:top-[calc(72px+var(--safe-top))] lg:max-h-[calc(100dvh-72px-var(--safe-top))] xl:hidden"
          >
            <nav aria-label="Mobile" className="container-page py-4">
              <ul className="divide-y divide-slate-100">
                {items.map((i) => (
                  <li key={i.href + i.label}>
                    <Link
                      href={i.href}
                      target={i.newTab ? "_blank" : undefined}
                      aria-current={i.href === path ? "page" : undefined}
                      className="flex min-h-12 items-center py-3 text-lg font-medium text-navy-900"
                      {...linkProps}
                    >
                      {i.label}
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="mt-6 grid gap-3 pb-2">
                <Link href="/my-t-county/" className="btn-secondary w-full" {...linkProps}>My T County</Link>
                {signedIn ? (
                  <Link href={accountHref} className="btn-primary w-full" {...linkProps}>My Account</Link>
                ) : (
                  <>
                    <Link href="/login/" className="btn-primary w-full" {...linkProps}>Sign In</Link>
                    <Link href="/register/" className="btn-secondary w-full" {...linkProps}>Create a free account</Link>
                  </>
                )}
                <Link href="/list-your-business/" className="btn-ghost w-full" {...linkProps}>List your business</Link>
              </div>
            </nav>
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}

"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import type { NavItem } from "./nav-data";

export function MobileMenu({ items, signedIn, accountHref }: { items: NavItem[]; signedIn: boolean; accountHref: string }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <div className="lg:hidden">
      <button type="button" className="btn-ghost px-3" aria-expanded={open} aria-controls="mobile-menu" aria-label={open ? "Close menu" : "Open menu"} onClick={() => setOpen(!open)}>
        {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
      </button>
      {open && (
        <div id="mobile-menu" className="fixed inset-x-0 bottom-0 top-[calc(4rem+var(--safe-top))] z-40 overflow-y-auto bg-white pb-safe">
          <nav aria-label="Mobile" className="container-page py-4">
            <ul className="divide-y divide-slate-100">
              {items.map((i) => (
                <li key={i.href + i.label}>
                  <Link href={i.href} target={i.newTab ? "_blank" : undefined} className="block py-4 text-lg font-medium text-navy-900">{i.label}</Link>
                </li>
              ))}
            </ul>
            <div className="mt-6 grid gap-3">
              {signedIn ? (
                <Link href={accountHref} className="btn-primary w-full">My Account</Link>
              ) : (
                <>
                  <Link href="/login" className="btn-primary w-full">Sign In</Link>
                  <Link href="/register" className="btn-secondary w-full">Create a free account</Link>
                </>
              )}
              <Link href="/list-your-business" className="btn-ghost w-full">List your business</Link>
            </div>
          </nav>
        </div>
      )}
    </div>
  );
}

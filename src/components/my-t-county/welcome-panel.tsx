"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PartyPopper, X } from "lucide-react";

/** One-time welcome after registration (?welcome=1). Dismissing removes the query string. */
export function WelcomePanel({ name, children }: { name: string | null; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  const router = useRouter();
  if (!open) return null;
  const close = () => { setOpen(false); router.replace("/my-t-county/", { scroll: false }); };
  return (
    <section aria-labelledby="mtc-welcome-title" className="container-page pt-6" data-testid="mtc-welcome">
      <div className="relative rounded-2xl bg-white p-5 shadow-sm ring-1 ring-hillside-200 sm:p-6">
        <button type="button" onClick={close} className="absolute right-2 top-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-slate-500 hover:text-navy-900" aria-label="Dismiss welcome" data-testid="mtc-welcome-dismiss">
          <X className="h-5 w-5" aria-hidden />
        </button>
        <h2 id="mtc-welcome-title" className="flex items-center gap-2 pr-10 font-display text-xl font-bold text-navy-900">
          <PartyPopper className="h-5 w-5 text-sunset-500" aria-hidden /> Welcome to My T County{name ? `, ${name}` : ""}!
        </h2>
        <p className="mt-1 text-sm text-slate-600">Optional: pick your community and a few favorite categories so the most relevant things show up first. You can change these any time under My Preferences.</p>
        <div className="mt-5">{children}</div>
        <button type="button" onClick={close} className="btn-ghost btn-sm mt-3 min-h-11">Skip for now</button>
      </div>
    </section>
  );
}

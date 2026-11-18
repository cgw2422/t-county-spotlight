"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PartyPopper, X } from "lucide-react";
import { SUBSCRIBE_PATH } from "@/lib/newsletter/copy";

/** Newsletter result of the registration (from a signed, short-lived token — see register-flash.ts). */
export type WelcomeNewsletterNote = { tone: "success" | "info" | "problem"; text: string; retry: boolean };

/** One-time welcome after registration (?welcome=1). Dismissing removes the query string. */
export function WelcomePanel({ name, newsletterNote, children }: { name: string | null; /** Shown only when they ticked the newsletter box at registration. */ newsletterNote?: WelcomeNewsletterNote | null; children: React.ReactNode }) {
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
        {newsletterNote && (
          <p data-testid="mtc-welcome-newsletter" data-tone={newsletterNote.tone}
            className={newsletterNote.tone === "problem" ? "mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200" : newsletterNote.tone === "success" ? "mt-2 text-sm font-medium text-hillside-700" : "mt-2 text-sm text-slate-600"}>
            {newsletterNote.text}
            {newsletterNote.retry && <> <Link href={SUBSCRIBE_PATH} className="font-semibold underline underline-offset-2" data-testid="mtc-welcome-newsletter-retry">our newsletter signup page</Link>.</>}
          </p>
        )}
        <div className="mt-5">{children}</div>
        <button type="button" onClick={close} className="btn-ghost btn-sm mt-3 min-h-11">Skip for now</button>
      </div>
    </section>
  );
}

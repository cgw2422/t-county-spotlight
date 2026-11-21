"use client";
import { useState } from "react";
import { Check, Copy, MessageSquareText } from "lucide-react";
import { ADD_YOUR_BUSINESS_URL, INVITATION_MESSAGE, facebookShareHref, smsHref } from "@/lib/business-leads-shared";

function FacebookIcon(props: React.SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}><path d="M22 12a10 10 0 1 0-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.49-3.89 3.78-3.89 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.44 2.89h-2.34v6.99A10 10 0 0 0 22 12Z" /></svg>;
}

/** "Help Us Spread the Word!" — copy / text / Facebook invitation to the Add Your Business page. */
export function ShareInvite() {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(INVITATION_MESSAGE);
    } catch {
      // Older browsers: copy via a temporary text area.
      const ta = document.createElement("textarea");
      ta.value = INVITATION_MESSAGE; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } finally { ta.remove(); }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };
  return (
    <section aria-labelledby="spread-the-word" className="rounded-2xl bg-navy-900 p-6 text-white sm:p-8" data-testid="share-invite">
      <h2 id="spread-the-word" className="font-display text-2xl font-bold">Help Us Spread the Word!</h2>
      <p className="mt-2 text-slate-200">Know a business owner who should be on T County Connect? Send them an invitation!</p>
      <blockquote className="mt-4 rounded-xl bg-white/10 p-4 text-sm text-slate-100 ring-1 ring-white/15" data-testid="invite-message">{INVITATION_MESSAGE}</blockquote>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <button type="button" onClick={copy} className="btn min-h-12 bg-sunset-500 font-semibold text-navy-950 hover:bg-sunset-400" data-testid="copy-invitation">
          {copied ? <><Check className="h-4 w-4" aria-hidden /> Copied!</> : <><Copy className="h-4 w-4" aria-hidden /> Copy Invitation</>}
        </button>
        <a href={smsHref(INVITATION_MESSAGE)} className="btn min-h-12 bg-white font-semibold text-navy-900 hover:bg-slate-100" data-testid="share-sms">
          <MessageSquareText className="h-4 w-4" aria-hidden /> Share by Text
        </a>
        <a href={facebookShareHref(ADD_YOUR_BUSINESS_URL)} target="_blank" rel="noopener noreferrer" className="btn min-h-12 bg-[#1877F2] font-semibold text-white hover:bg-[#166fe5]" data-testid="share-facebook">
          <FacebookIcon className="h-4 w-4" /> Share on Facebook
        </a>
      </div>
      <p role="status" aria-live="polite" className="sr-only">{copied ? "Invitation copied" : ""}</p>
    </section>
  );
}

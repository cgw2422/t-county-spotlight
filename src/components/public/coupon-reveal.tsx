"use client";
import { useState } from "react";
import { Check, Copy, Ticket } from "lucide-react";

export function CouponReveal({ code }: { code: string }) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  if (!shown) {
    return (
      <button type="button" className="btn-accent w-full" onClick={() => setShown(true)}>
        <Ticket className="h-5 w-5" aria-hidden /> Reveal coupon code
      </button>
    );
  }
  return (
    <div className="flex items-stretch gap-2">
      <output aria-label="Coupon code" className="flex min-h-11 flex-1 items-center justify-center rounded-lg border-2 border-dashed border-sunset-500 bg-orange-50 px-3 font-mono text-lg font-bold tracking-wider text-navy-900">{code}</output>
      <button
        type="button"
        className="btn-secondary"
        onClick={async () => { try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {} }}
        aria-label={copied ? "Copied" : "Copy code"}
      >
        {copied ? <Check className="h-4 w-4 text-emerald-600" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
      </button>
    </div>
  );
}

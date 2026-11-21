"use client";
import { useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

/** Read-only URL field with a Copy Link button (falls back to selecting the text when the clipboard API is blocked). */
export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      ref.current?.select();
      document.execCommand?.("copy");
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <label className="sr-only" htmlFor="article-link-url">Article URL</label>
      <input id="article-link-url" ref={ref} readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="input min-w-0 flex-1 font-mono text-sm" data-testid="article-link-url" />
      <button type="button" onClick={copy} className="btn-primary shrink-0" data-testid="copy-link">
        {copied ? <><Check className="h-4 w-4" aria-hidden /> Copied</> : <><Copy className="h-4 w-4" aria-hidden /> Copy Link</>}
      </button>
      <span role="status" aria-live="polite" className="sr-only">{copied ? "Link copied" : ""}</span>
    </div>
  );
}

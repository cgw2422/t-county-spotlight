"use client";
import { useState, useSyncExternalStore } from "react";
import { Check, Link2, Mail, Share2 } from "lucide-react";

function FacebookIcon() {
  return <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden fill="currentColor"><path d="M13.5 21v-7.5h2.5l.4-3h-2.9V8.6c0-.9.3-1.5 1.5-1.5h1.6V4.4c-.3 0-1.2-.1-2.3-.1-2.3 0-3.8 1.4-3.8 3.9v2.3H8v3h2.5V21h3z" /></svg>;
}
function XIcon() {
  return <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" aria-hidden fill="currentColor"><path d="M17.8 3h3.1l-6.8 7.7L22 21h-6.2l-4.9-6.3L5.3 21H2.2l7.2-8.3L1.9 3h6.4l4.4 5.8L17.8 3zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5z" /></svg>;
}

const noop = () => () => {};

/** Share links (no third-party scripts). Uses the native share sheet when available. */
export function ShareButtons({ url, title, className = "" }: { url: string; title: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const canShare = useSyncExternalStore(noop, () => "share" in navigator, () => false);
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(title);
  const item = "flex h-11 w-11 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 hover:text-navy-900";

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link:", url);
    }
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <span className="mr-1 text-sm font-semibold text-slate-700">Share</span>
      {canShare && (
        <button type="button" className={`${item} sm:hidden`} aria-label="Share" onClick={() => navigator.share({ title, url }).catch(() => {})}>
          <Share2 className="h-5 w-5" aria-hidden />
        </button>
      )}
      <a className={item} href={`https://www.facebook.com/sharer/sharer.php?u=${u}`} target="_blank" rel="noopener noreferrer" aria-label="Share on Facebook"><FacebookIcon /></a>
      <a className={item} href={`https://x.com/intent/post?url=${u}&text=${t}`} target="_blank" rel="noopener noreferrer" aria-label="Share on X"><XIcon /></a>
      <a className={item} href={`mailto:?subject=${t}&body=${u}`} aria-label="Share by email"><Mail className="h-5 w-5" aria-hidden /></a>
      <button type="button" className={item} onClick={copy} aria-label={copied ? "Link copied" : "Copy link"}>
        {copied ? <Check className="h-5 w-5 text-emerald-600" aria-hidden /> : <Link2 className="h-5 w-5" aria-hidden />}
      </button>
      <span role="status" aria-live="polite" className="text-sm text-emerald-700">{copied ? "Link copied" : ""}</span>
    </div>
  );
}

"use client";
import { useEffect, useRef, useState } from "react";
import { Hero } from "@/components/home/hero";
import type { HeroAppearance } from "@/components/home/hero-background";
import { PREVIEW_MSG } from "../preview-frames";

/** Renders the real <Hero>; when embedded, accepts live appearance updates from the editor. */
export function PreviewHero({ headline, sub, initial, embed }: { headline: string; sub: string; initial: HeroAppearance | null; embed: boolean }) {
  const [appearance, setAppearance] = useState<HeroAppearance | null>(initial);
  const [showAside, setShowAside] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!embed || window.parent === window) return;
    const origin = window.location.origin;
    function onMsg(e: MessageEvent) {
      if (e.origin !== origin || e.source !== window.parent) return;
      const d = e.data as { type?: string; appearance?: HeroAppearance; showAside?: boolean };
      if (d?.type !== PREVIEW_MSG.state) return;
      if (d.appearance) setAppearance(d.appearance);
      setShowAside(!!d.showAside);
    }
    window.addEventListener("message", onMsg);
    window.parent.postMessage({ type: PREVIEW_MSG.ready }, origin);
    const el = ref.current;
    const ro = el ? new ResizeObserver(() => window.parent.postMessage({ type: PREVIEW_MSG.height, height: el.offsetHeight }, origin)) : null;
    if (el) ro?.observe(el);
    return () => { window.removeEventListener("message", onMsg); ro?.disconnect(); };
  }, [embed]);

  return (
    <div ref={ref} data-testid="hero-preview">
      <Hero headline={headline} sub={sub} appearance={appearance} aside={showAside ? <AsidePlaceholder /> : undefined} />
    </div>
  );
}

/** Stand-in for the featured Community Pulse card (layout check only — no content). */
function AsidePlaceholder() {
  return (
    <div className="rounded-2xl bg-white/95 p-5 shadow-xl ring-1 ring-black/5">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Community Pulse</p>
      <p className="mt-1 text-sm text-slate-500">Layout placeholder — the featured Pulse card appears here on the homepage.</p>
      <div className="mt-4 space-y-2" aria-hidden>
        {[90, 75, 60].map((w) => <div key={w} className="h-9 rounded-lg bg-slate-100" style={{ width: `${w}%` }} />)}
      </div>
    </div>
  );
}

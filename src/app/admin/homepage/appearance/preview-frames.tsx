"use client";
import { useEffect, useRef, useState } from "react";
import { Monitor, Smartphone } from "lucide-react";
import type { HeroAppearance } from "@/components/home/hero-background";

export const PREVIEW_MSG = { state: "tcc-hero-preview:state", ready: "tcc-hero-preview:ready", height: "tcc-hero-preview:height" } as const;
const SRC = "/admin/homepage/appearance/preview/?embed=1";

/**
 * Live preview: the real homepage <Hero> rendered by the preview route inside
 * iframes at true desktop (1440px) and phone (390px) widths, so breakpoints,
 * focal points and the mobile image behave exactly as on the site. Unsaved
 * edits are pushed into the frames with postMessage (same origin only).
 */
export function PreviewFrames({ appearance, showAside }: { appearance: HeroAppearance; showAside: boolean }) {
  return (
    <div className="space-y-4">
      <Frame label="Desktop · 1440px" icon={Monitor} width={1440} appearance={appearance} showAside={showAside} />
      <div className="flex flex-wrap items-start gap-4">
        <Frame label="Phone · 390px" icon={Smartphone} width={390} fixedScale={0.62} appearance={appearance} showAside={showAside} />
        <p className="help max-w-56 flex-1">Phones and tablets narrower than 1024px use the mobile focal point (and the mobile image, if you add one).</p>
      </div>
    </div>
  );
}

function Frame({ label, icon: Icon, width, fixedScale, appearance, showAside }: {
  label: string; icon: typeof Monitor; width: number; fixedScale?: number; appearance: HeroAppearance; showAside: boolean;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [scale, setScale] = useState(fixedScale ?? 0.4);
  const [height, setHeight] = useState(width > 1000 ? 640 : 760);
  const latest = useRef({ appearance, showAside });

  const post = () => frame.current?.contentWindow?.postMessage({ type: PREVIEW_MSG.state, ...latest.current }, window.location.origin);

  useEffect(() => {
    latest.current = { appearance, showAside };
    post();
  }, [appearance, showAside]);

  useEffect(() => {
    if (fixedScale) return;
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(Math.min(1, el.clientWidth / width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [fixedScale, width]);

  useEffect(() => {
    function onMsg(e: MessageEvent) {
      if (e.origin !== window.location.origin || e.source !== frame.current?.contentWindow) return;
      const d = e.data as { type?: string; height?: number };
      if (d?.type === PREVIEW_MSG.ready) post();
      if (d?.type === PREVIEW_MSG.height && typeof d.height === "number" && d.height > 100) setHeight(Math.min(1600, Math.ceil(d.height)));
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  return (
    <figure className={fixedScale ? "shrink-0" : "w-full"}>
      <figcaption className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-500"><Icon className="h-3.5 w-3.5" aria-hidden /> {label}</figcaption>
      <div ref={wrap} className="overflow-hidden rounded-lg bg-slate-200 ring-1 ring-slate-300" style={{ height: height * scale, width: fixedScale ? width * scale : undefined }}>
        <iframe
          ref={frame}
          src={SRC}
          title={`Homepage hero preview, ${label}`}
          tabIndex={-1}
          onLoad={post}
          style={{ width, height, transform: `scale(${scale})`, transformOrigin: "0 0", border: 0, display: "block" }}
        />
      </div>
    </figure>
  );
}

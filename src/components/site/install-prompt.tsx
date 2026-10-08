"use client";
import { useEffect, useState } from "react";
import { Share, X } from "lucide-react";
import { OhioMark } from "./logo";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const KEY = "tcs-install-dismissed";

/** Install guidance: native prompt on Android/desktop Chrome, instructions on iOS Safari. */
export function InstallPrompt() {
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    let dismissed = false;
    try { dismissed = !!localStorage.getItem(KEY); } catch {}
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone;
    if (dismissed || standalone) return;
    const onBip = (e: Event) => { e.preventDefault(); setEvt(e as BIPEvent); setShow(true); };
    window.addEventListener("beforeinstallprompt", onBip);
    const ua = navigator.userAgent;
    const isIos = /iphone|ipad|ipod/i.test(ua) && /safari/i.test(ua) && !/crios|fxios/i.test(ua);
    let t: ReturnType<typeof setTimeout> | undefined;
    if (isIos) { setIos(true); t = setTimeout(() => setShow(true), 15000); }
    return () => { window.removeEventListener("beforeinstallprompt", onBip); if (t) clearTimeout(t); };
  }, []);

  const dismiss = () => { setShow(false); try { localStorage.setItem(KEY, "1"); } catch {} };
  if (!show) return null;
  return (
    <div role="dialog" aria-label="Install TCountySpotlight" className="fixed inset-x-3 bottom-[calc(4.5rem+var(--safe-bottom))] z-50 mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-xl lg:bottom-6">
      <div className="flex gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-navy-800 text-white"><OhioMark className="h-7 w-7" /></div>
        <div className="flex-1">
          <p className="font-semibold text-navy-900">Install TCountySpotlight</p>
          {ios ? (
            <p className="mt-1 text-sm text-slate-600">Tap <Share className="inline h-4 w-4" aria-label="Share" /> then <strong>Add to Home Screen</strong> for quick access to events, specials and local businesses.</p>
          ) : (
            <p className="mt-1 text-sm text-slate-600">Add it to your home screen for a faster, app-like experience.</p>
          )}
          <div className="mt-3 flex gap-2">
            {!ios && evt && (
              <button className="btn-primary btn-sm" onClick={async () => { await evt.prompt(); await evt.userChoice; dismiss(); }}>Install</button>
            )}
            <button className="btn-secondary btn-sm" onClick={dismiss}>Not now</button>
          </div>
        </div>
        <button aria-label="Dismiss" className="self-start p-1 text-slate-400 hover:text-slate-600" onClick={dismiss}><X className="h-5 w-5" /></button>
      </div>
    </div>
  );
}

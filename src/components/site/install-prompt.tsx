"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Share, X } from "lucide-react";
import { OhioMark } from "./logo";
import { sendTrack } from "@/components/public/track";
import { ENGAGED_KEY, ENGAGED_SIGNAL } from "@/lib/resident-accounts";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** Dismissal time (ms). Older builds stored "1"; that is treated as "dismissed now". */
const KEY = "tcs-install-dismissed";
/** Device-local visit days: { last: "YYYY-MM-DD", days: n } — dates only, never sent anywhere. */
const DAYS_KEY = "tct_install_days";
const DISMISS_MS = 30 * 86400_000;
/** Delay after page load (eligible visits) and after a save/recommend (lets the save hint finish first). */
const LOAD_DELAY_MS = 5000;
const ENGAGED_DELAY_MS = 10000;
/** Pages where an install invitation would get in the way. */
const QUIET_PATHS = ["/login", "/register", "/forgot-password", "/reset-password", "/verify-email", "/invite", "/account/password", "/offline"];

function localDay() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Counts distinct days this device has opened the site; returns the count including today. */
function countVisitDay(): number {
  try {
    const raw = localStorage.getItem(DAYS_KEY);
    const v = raw ? (JSON.parse(raw) as { last?: string; days?: number }) : {};
    const today = localDay();
    const days = typeof v.days === "number" && v.days > 0 ? v.days : 0;
    if (v.last === today) return Math.max(days, 1);
    const next = days + 1;
    localStorage.setItem(DAYS_KEY, JSON.stringify({ last: today, days: next }));
    return next;
  } catch {
    return 0;
  }
}

function dismissedRecently(): boolean {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;
    const at = Number(raw);
    if (!Number.isFinite(at) || at < 1e12) { localStorage.setItem(KEY, String(Date.now())); return true; }
    return Date.now() - at < DISMISS_MS;
  } catch {
    return true; // storage blocked: we can't remember a dismissal, so don't nag
  }
}

function engaged(): boolean {
  try { return !!localStorage.getItem(ENGAGED_KEY); } catch { return false; }
}

/**
 * "Keep T County Close." install invitation — phones and tablets only, never on a first visit:
 * shown on a second day of use, or after the first save or recommendation. Hidden when already
 * installed and for 30 days after "Not now". Android/Chrome uses the native prompt
 * (beforeinstallprompt); iPhone/iPad Safari gets Share → Add to Home Screen instructions;
 * other browsers see nothing.
 */
export function InstallPrompt() {
  const path = usePathname() || "/";
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [show, setShow] = useState(false);
  const quiet = QUIET_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
  const quietRef = useRef(quiet);
  useEffect(() => { quietRef.current = quiet; }, [quiet]);

  useEffect(() => {
    const nav = navigator as Navigator & { standalone?: boolean };
    const standalone = window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
    if (standalone) return;
    const ua = navigator.userAgent;
    const iosDevice = /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
    const iosSafari = iosDevice && /safari/i.test(ua) && !/crios|fxios|edgios|opios|gsa\/|fban|fbav|instagram|line\//i.test(ua);
    const android = /android/i.test(ua);
    const days = countVisitDay();
    if (!iosSafari && !android) return; // desktop and other browsers: never

    let native: BIPEvent | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let shown = false;
    const tryShow = (delay: number) => {
      if (shown || dismissedRecently()) return;
      if (!iosSafari && !native) return; // Android: only once the browser says it can install
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (shown || dismissedRecently() || quietRef.current) return;
        shown = true;
        setIos(iosSafari);
        setShow(true);
        sendTrack({ type: "install_prompt_shown", targetType: "PWA", targetId: iosSafari ? "ios" : "native" });
      }, delay);
    };
    const eligibleNow = () => days >= 2 || engaged();

    const onBip = (e: Event) => {
      e.preventDefault();
      native = e as BIPEvent;
      setEvt(native);
      if (eligibleNow()) tryShow(LOAD_DELAY_MS);
    };
    const onEngaged = () => tryShow(ENGAGED_DELAY_MS);
    window.addEventListener("beforeinstallprompt", onBip);
    window.addEventListener(ENGAGED_SIGNAL, onEngaged);
    if (iosSafari && eligibleNow()) tryShow(LOAD_DELAY_MS);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      window.removeEventListener(ENGAGED_SIGNAL, onEngaged);
      if (timer) clearTimeout(timer);
    };
  }, []);

  const dismiss = () => { setShow(false); try { localStorage.setItem(KEY, String(Date.now())); } catch {} };
  if (!show || quiet) return null;
  return (
    <div role="dialog" aria-labelledby="install-title" data-testid="install-prompt" className="fixed inset-x-3 bottom-[calc(4.5rem+var(--safe-bottom))] z-50 mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-xl lg:bottom-6">
      <div className="flex gap-3">
        <OhioMark className="h-12 w-12 shrink-0 rounded-xl ring-1 ring-slate-200" />
        <div className="min-w-0 flex-1">
          <p id="install-title" className="font-display font-bold text-navy-900">Keep T County Close.</p>
          <p className="mt-1 text-sm text-slate-600">Add T County Connect to your home screen for quick access to events, food trucks, local favorites, and community updates.</p>
          {ios && (
            <p className="mt-2 text-sm text-slate-700" data-testid="install-ios-steps">Tap <Share className="inline h-4 w-4 align-text-bottom" aria-label="Share" /> <strong>Share</strong>, then <strong>Add to Home Screen</strong>.</p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {!ios && evt && (
              <button className="btn-primary btn-sm min-h-11" onClick={async () => { await evt.prompt(); const choice = await evt.userChoice; if (choice.outcome === "accepted") sendTrack({ type: "install_prompt_accepted", targetType: "PWA", targetId: "native" }); dismiss(); }}>Add to home screen</button>
            )}
            <button className="btn-secondary btn-sm min-h-11" onClick={dismiss} data-testid="install-dismiss">Not now</button>
          </div>
        </div>
        <button aria-label="Dismiss" className="-m-1 inline-flex min-h-11 min-w-11 items-start justify-center self-start p-1 text-slate-400 hover:text-slate-600" onClick={dismiss}><X className="h-5 w-5" /></button>
      </div>
    </div>
  );
}

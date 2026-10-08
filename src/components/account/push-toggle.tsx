"use client";
import { useEffect, useState } from "react";
import { BellOff, BellRing, Loader2, Share } from "lucide-react";

type Mode = "loading" | "hidden" | "unsupported" | "ios-install" | "denied" | "off" | "on";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function getRegistration() {
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing) return existing;
  await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  return navigator.serviceWorker.ready;
}

/** Push notification opt-in for this device. Renders nothing when push isn't configured. */
export function PushToggle() {
  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const [mode, setMode] = useState<Mode>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!vapid) return setMode("hidden");
      const ua = navigator.userAgent;
      const ios = /iphone|ipad|ipod/i.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone;
      const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      if (!supported) return setMode(ios && !standalone ? "ios-install" : "unsupported");
      if (Notification.permission === "denied") return setMode("denied");
      try {
        const reg = await navigator.serviceWorker.getRegistration("/");
        const sub = await reg?.pushManager.getSubscription();
        setMode(sub ? "on" : "off");
      } catch {
        setMode("off");
      }
    })();
  }, [vapid]);

  async function enable() {
    setBusy(true); setError(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setMode(perm === "denied" ? "denied" : "off"); return; }
      const reg = await getRegistration();
      const sub = (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapid!) }));
      const res = await fetch("/api/push/subscribe/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
      if (!res.ok) throw new Error("Couldn't save your subscription. Please try again.");
      setMode("on");
    } catch (e) {
      setError((e as Error).message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true); setError(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe/", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
      setMode("off");
    } catch (e) {
      setError((e as Error).message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  if (mode === "hidden" || mode === "loading") return null;
  return (
    <div className="card p-5">
      <h2 className="flex items-center gap-2 font-semibold text-navy-900"><BellRing className="h-5 w-5 text-brand-600" aria-hidden /> Push notifications on this device</h2>
      {mode === "ios-install" && (
        <p className="mt-2 text-sm text-slate-600">
          On iPhone and iPad, notifications work once the app is on your home screen (iOS 16.4 or newer). Tap <Share className="inline h-4 w-4" aria-label="Share" /> then <strong>Add to Home Screen</strong>, open TCountySpotlight from your home screen, and come back here.
        </p>
      )}
      {mode === "unsupported" && <p className="mt-2 text-sm text-slate-600">This browser doesn&apos;t support push notifications. You can still get updates by email.</p>}
      {mode === "denied" && <p className="mt-2 text-sm text-slate-600">Notifications are blocked for this site. To turn them on, allow notifications in your browser or phone settings, then reload this page.</p>}
      {(mode === "off" || mode === "on") && (
        <>
          <p className="mt-2 text-sm text-slate-600">
            {mode === "on" ? "You'll get alerts on this device for the topics you've chosen below." : "Get alerts on this device for the topics you choose below. You can turn them off anytime."}
          </p>
          <div className="mt-4">
            {mode === "off" ? (
              <button type="button" className="btn-primary w-full sm:w-auto" onClick={enable} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />} Turn on notifications
              </button>
            ) : (
              <button type="button" className="btn-secondary w-full sm:w-auto" onClick={disable} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellOff className="h-4 w-4" />} Turn off on this device
              </button>
            )}
          </div>
        </>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}

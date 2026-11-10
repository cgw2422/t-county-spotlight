"use client";
import { useEffect } from "react";

export type TrackPayload = { type: string; businessId?: string | null; targetType?: string; targetId?: string };

/**
 * False when the visitor has asked not to be tracked (Global Privacy Control or
 * Do Not Track). Every client-side signal goes through this check; /api/track
 * also drops requests carrying the matching headers.
 */
export function trackingAllowed() {
  try {
    const nav = navigator as Navigator & { globalPrivacyControl?: boolean; msDoNotTrack?: string };
    const w = window as Window & { doNotTrack?: string };
    if (nav.globalPrivacyControl === true) return false;
    if (nav.doNotTrack === "1" || nav.doNotTrack === "yes" || w.doNotTrack === "1" || nav.msDoNotTrack === "1") return false;
    return true;
  } catch {
    return false;
  }
}

/** Fire-and-forget engagement beacon (no cookies, no third parties). Skipped under GPC / Do Not Track. */
let last = { body: "", at: 0 };

export function sendTrack(p: TrackPayload) {
  if (!trackingAllowed()) return;
  try {
    const body = JSON.stringify(p);
    // Drop an identical signal fired again within a second (double mounts, double taps).
    const now = Date.now();
    if (body === last.body && now - last.at < 1000) return;
    last = { body, at: now };
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/track/", new Blob([body], { type: "application/json" }));
    } else {
      fetch("/api/track/", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
    }
  } catch {}
}

/** Records one view when the page mounts. */
export function TrackView(p: TrackPayload) {
  const { type, businessId, targetType, targetId } = p;
  useEffect(() => {
    sendTrack({ type, businessId, targetType, targetId });
  }, [type, businessId, targetType, targetId]);
  return null;
}

/** An outbound link/button that records a click (website, phone, directions). */
export function TrackedLink({ track, children, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { track: TrackPayload }) {
  return (
    <a {...rest} onClick={(e) => { sendTrack(track); rest.onClick?.(e); }}>
      {children}
    </a>
  );
}

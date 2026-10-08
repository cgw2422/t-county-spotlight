"use client";
import { useEffect } from "react";

export type TrackPayload = { type: string; businessId?: string | null; targetType?: string; targetId?: string };

/** Fire-and-forget engagement beacon (no cookies, no third parties). */
export function sendTrack(p: TrackPayload) {
  try {
    const body = JSON.stringify(p);
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

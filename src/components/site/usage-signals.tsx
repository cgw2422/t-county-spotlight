"use client";
import { useEffect } from "react";
import { sendTrack, trackingAllowed } from "@/components/public/track";

/** Device-local flags (dates only; never an identifier, never sent to the server). */
const SEEN_KEY = "tct_seen";
const PWA_LAUNCH_KEY = "tct_pwa_launch";

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Aggregate, privacy-conscious usage signals:
 * - `visit` once per day per device: "returning" when this browser has a `tct_seen`
 *   date from an earlier day, otherwise "new". Only that one word is sent; the flag is
 *   a date stored on the device and is not an identifier. Clearing site data resets it.
 * - `pwa_launch` once per day when opened as an installed app (display-mode standalone).
 * - `pwa_installed` when the browser fires `appinstalled` (Chromium only; iOS never does).
 * Nothing is sent under Global Privacy Control / Do Not Track, and nothing is sent when
 * storage is unavailable (we can't tell new from returning, so we don't guess).
 */
export function UsageSignals() {
  useEffect(() => {
    if (!trackingAllowed()) return;
    const today = todayKey();
    try {
      const seen = localStorage.getItem(SEEN_KEY);
      if (seen !== today) {
        localStorage.setItem(SEEN_KEY, today);
        sendTrack({ type: "visit", targetType: "VISIT", targetId: seen ? "returning" : "new" });
      }
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
      if (standalone && localStorage.getItem(PWA_LAUNCH_KEY) !== today) {
        localStorage.setItem(PWA_LAUNCH_KEY, today);
        sendTrack({ type: "pwa_launch" });
      }
    } catch {}
    const onInstalled = () => sendTrack({ type: "pwa_installed" });
    window.addEventListener("appinstalled", onInstalled);
    return () => window.removeEventListener("appinstalled", onInstalled);
  }, []);
  return null;
}

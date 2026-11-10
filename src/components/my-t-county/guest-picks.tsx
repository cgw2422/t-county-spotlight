"use client";
import { useEffect, useState } from "react";
import { readLocal } from "@/lib/guest-merge";
import { GUEST_PREFS_KEY, parseGuestPrefs } from "@/lib/my-t-county-shared";
import type { Pick } from "@/lib/my-t-county";
import { PickList } from "./pick-list";

export const PREFS_CHANGED_EVENT = "tct-prefs-changed";

/** Guests: "Picked for you" from interests saved in this browser only. */
export function GuestPicks({ community }: { community: string | null }) {
  const [state, setState] = useState<{ interests: number; picks: Pick[] } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const prefs = parseGuestPrefs(readLocal(GUEST_PREFS_KEY));
      if (!prefs.interests.length) { if (!cancelled) setState({ interests: 0, picks: [] }); return; }
      const q = new URLSearchParams({ interests: prefs.interests.join(","), communities: prefs.extraCommunities.join(","), community: community ?? "" });
      try {
        const res = await fetch(`/api/my-t-county/picks/?${q}`);
        const data = res.ok ? ((await res.json()) as { picks: Pick[] }) : { picks: [] };
        if (!cancelled) setState({ interests: prefs.interests.length, picks: data.picks });
      } catch {
        if (!cancelled) setState({ interests: prefs.interests.length, picks: [] });
      }
    };
    load();
    window.addEventListener(PREFS_CHANGED_EVENT, load);
    return () => { cancelled = true; window.removeEventListener(PREFS_CHANGED_EVENT, load); };
  }, [community]);
  if (!state) return null;
  if (!state.interests) return <p className="text-sm text-slate-600">Choose a few favorite categories under <a href="#my-preferences" className="font-semibold text-brand-700 hover:underline">My Preferences</a> to see suggestions here.</p>;
  if (!state.picks.length) return <p className="text-sm text-slate-600" data-testid="picks-empty">Nothing matching your interests is listed for the next two weeks yet.</p>;
  return <PickList picks={state.picks} />;
}

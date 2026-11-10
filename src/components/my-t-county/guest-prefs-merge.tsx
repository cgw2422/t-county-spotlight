"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { readLocal, runGuestMergeOnce, writeLocal } from "@/lib/guest-merge";
import { ALL_COUNTY, COMMUNITY_COOKIE, GUEST_PREFS_KEY, parseGuestPrefs } from "@/lib/my-t-county-shared";

function communityCookie() {
  const m = document.cookie.match(new RegExp(`(?:^|; )${COMMUNITY_COOKIE}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : "";
}

/**
 * Signed-in only: once per tab session, merges guest preferences saved on this
 * device into the account (account values win), then clears the local copy.
 */
export function GuestPrefsMerge({ userId }: { userId: string }) {
  const router = useRouter();
  useEffect(() => {
    runGuestMergeOnce(`prefs:${userId}`, async () => {
      const local = parseGuestPrefs(readLocal(GUEST_PREFS_KEY));
      const cookie = communityCookie();
      if (!local.extraCommunities.length && !local.interests.length && (!cookie || cookie === ALL_COUNTY)) return true;
      const res = await fetch("/api/my-t-county/merge/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extraCommunities: local.extraCommunities, interests: local.interests }),
      });
      if (!res.ok) return false;
      const data = (await res.json()) as { merged?: string[] };
      writeLocal(GUEST_PREFS_KEY, null);
      if (data.merged?.length) router.refresh();
      return true;
    });
  }, [userId, router]);
  return null;
}

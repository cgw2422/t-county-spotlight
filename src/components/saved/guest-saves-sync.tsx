"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { runGuestMergeOnce } from "@/lib/guest-merge";
import { mergeLocalSaves, readLocalSaved } from "@/lib/saved-local";

/**
 * After sign-in or registration, adds the saves a guest made on this device to
 * their account (once), then clears the device copy. Renders nothing.
 */
export function GuestSavesSync({ userId }: { userId: string | null }) {
  const router = useRouter();
  useEffect(() => {
    if (!userId) return;
    let hasLocal = false;
    try { hasLocal = readLocalSaved().length > 0; } catch {}
    if (!hasLocal) return;
    void runGuestMergeOnce(`saved:${userId}`, async () => {
      const r = await mergeLocalSaves();
      if (r.ok && r.added > 0) router.refresh();
      return r.ok;
    });
  }, [userId, router]);
  return null;
}

"use client";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, BellRing, Heart, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SavedKind } from "@/lib/saved-shared";
import { getMemberSavedState, noteMemberSaved, setLocalSaved, takeGuestHint, useLocalSaved } from "@/lib/saved-local";
import { SAVED_CHANGE_SIGNAL, markEngaged, registerHref } from "@/lib/resident-accounts";

/** Tells other components on the page (event reminder, install invitation) that something was saved or unsaved. */
function announce(type: string, targetId: string, saved: boolean, guest: boolean) {
  if (saved) markEngaged();
  try { window.dispatchEvent(new CustomEvent(SAVED_CHANGE_SIGNAL, { detail: { type, targetId, saved, guest } })); } catch {}
}

export type SaveKind = SavedKind | "BUSINESS_FOLLOW";

/** Set once the server tells us this visitor has no account (saves go to the device). */
let knownGuest = false;

/**
 * Optimistic save / follow toggle.
 * - Members: saved to the account (`initial` from the server; omit it on cards and
 *   the state is fetched once per page).
 * - Guests: saved on this device (localStorage) with a one-time hint to create an account.
 * - Following a business (`type="BUSINESS_FOLLOW"`) needs an account: guests go to /login/.
 */
export function SaveButton({ type, targetId, initial, label, savedLabel, className, wrapperClassName, compact = false }: {
  type: SaveKind; targetId: string; initial?: boolean; label?: string; savedLabel?: string; className?: string; wrapperClassName?: string; compact?: boolean;
}) {
  const follow = type === "BUSINESS_FOLLOW";
  const local = useLocalSaved();
  const localHas = !follow && local.some((e) => e.type === type && e.targetId === targetId);
  const [fetched, setFetched] = useState<boolean | null>(null);
  const [override, setOverride] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState(false);
  const [pending, start] = useTransition();
  const path = usePathname();
  const router = useRouter();

  // Cards don't pass server state: ask once per page whether the member saved it.
  useEffect(() => {
    if (initial !== undefined) return;
    let live = true;
    void getMemberSavedState().then((s) => {
      if (!s.signedIn) knownGuest = true;
      if (live) setFetched(s.keys.has(`${type}:${targetId}`));
    });
    return () => { live = false; };
  }, [initial, type, targetId]);

  useEffect(() => {
    if (!hint) return;
    const t = setTimeout(() => setHint(false), 9000);
    return () => clearTimeout(t);
  }, [hint]);

  const saved = override ?? ((initial ?? fetched ?? false) || localHas);
  const text = saved ? (savedLabel ?? (follow ? "Following" : "Saved")) : (label ?? (follow ? "Follow" : "Save"));
  const Icon = follow ? (saved ? BellRing : Bell) : Heart;

  function saveOnDevice(next: boolean) {
    if (!setLocalSaved(type as SavedKind, targetId, next)) {
      setOverride(!next);
      setError("Couldn't save on this device. Sign in to save.");
      return;
    }
    setOverride(next);
    announce(type, targetId, next, true);
    if (next && takeGuestHint()) setHint(true);
  }

  function toggle() {
    const next = !saved;
    setOverride(next);
    setError(null);
    start(async () => {
      try {
        const res = await fetch("/api/save/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type, targetId, action: follow ? (next ? "follow" : "unfollow") : next ? "save" : "unsave" }),
        });
        if (res.status === 401) {
          setOverride(!next);
          router.push(`/login/?next=${encodeURIComponent(path || "/")}`);
          return;
        }
        if (res.status === 404) {
          // Not public any more (or the event/sale is over). Unsaving locally still works.
          setOverride(!next);
          setError("This can't be saved right now.");
          return;
        }
        if (!res.ok) throw new Error();
        const json = (await res.json()) as { saved: boolean; guest?: boolean };
        if (json.guest) {
          knownGuest = true;
          saveOnDevice(json.saved);
          return;
        }
        setOverride(json.saved);
        announce(type, targetId, json.saved, false);
        if (!follow) {
          noteMemberSaved(type, targetId, json.saved);
          if (!json.saved && localHas) setLocalSaved(type as SavedKind, targetId, false);
        }
      } catch {
        // Offline guest: unsaving on the device always works.
        if (knownGuest && !follow && !next) { saveOnDevice(false); return; }
        setOverride(!next);
        setError("Couldn't update. Try again.");
      }
    });
  }

  return (
    <span className={cn("inline-flex flex-col", className?.includes("w-full") && "w-full", wrapperClassName)}>
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={saved}
        aria-label={compact ? text : undefined}
        title={compact ? text : undefined}
        data-testid="save-button"
        className={cn(
          compact ? "btn-secondary px-3" : "btn-secondary",
          saved && "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100",
          saved && follow && "border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100",
          className,
        )}
      >
        <Icon className={cn("h-5 w-5", saved && !follow && "fill-current")} aria-hidden />
        {!compact && <span>{text}</span>}
      </button>
      {error && <span role="alert" className="mt-1 text-xs text-red-600">{error}</span>}
      {hint && (
        <span
          role="status"
          data-testid="guest-save-hint"
          className="fixed inset-x-4 bottom-[calc(4.5rem+var(--safe-bottom))] z-50 mx-auto flex max-w-md items-start gap-3 rounded-2xl bg-navy-900 px-4 py-3 text-left text-sm text-white shadow-lg lg:bottom-6"
        >
          <span className="flex-1">
            Saved on this device. A free account keeps your favorites synced across your phone, tablet and computer.{" "}
            <Link href={registerHref("save", path || "/saved/")} className="font-semibold underline underline-offset-2" data-testid="guest-save-register">Create free account</Link>
          </span>
          <button type="button" onClick={() => setHint(false)} className="-m-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-white/80 hover:text-white" aria-label="Dismiss">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </span>
      )}
    </span>
  );
}

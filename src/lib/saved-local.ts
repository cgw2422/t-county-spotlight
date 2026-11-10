"use client";
import { useSyncExternalStore } from "react";
import { LOCAL_SAVED_HINT_KEY, LOCAL_SAVED_KEY, SAVED_MAX, isSavedKind, type LocalSavedEntry, type SavedKind } from "./saved-shared";

/**
 * Guest saves kept in this browser (localStorage `tct_saved_v1`). Every access
 * is wrapped: storage can be blocked or throw (private mode, previews).
 */

const CHANGE_EVENT = "tct-saved-change";
const EMPTY: LocalSavedEntry[] = [];
let cacheRaw: string | null = null;
let cacheList: LocalSavedEntry[] = EMPTY;

function parse(raw: string | null): LocalSavedEntry[] {
  if (!raw) return EMPTY;
  try {
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return EMPTY;
    const seen = new Set<string>();
    const out: LocalSavedEntry[] = [];
    for (const x of data) {
      if (!x || typeof x !== "object") continue;
      const { type, targetId, savedAt } = x as Record<string, unknown>;
      if (!isSavedKind(type) || typeof targetId !== "string" || !targetId || targetId.length > 40) continue;
      const key = `${type}:${targetId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ type, targetId, savedAt: typeof savedAt === "string" ? savedAt : new Date().toISOString() });
    }
    return out.slice(0, SAVED_MAX);
  } catch {
    return EMPTY;
  }
}

export function readLocalSaved(): LocalSavedEntry[] {
  let raw: string | null = null;
  try { raw = window.localStorage.getItem(LOCAL_SAVED_KEY); } catch { return EMPTY; }
  if (raw === cacheRaw) return cacheList;
  cacheRaw = raw;
  cacheList = parse(raw);
  return cacheList;
}

function writeLocalSaved(list: LocalSavedEntry[]) {
  try {
    if (list.length) window.localStorage.setItem(LOCAL_SAVED_KEY, JSON.stringify(list.slice(0, SAVED_MAX)));
    else window.localStorage.removeItem(LOCAL_SAVED_KEY);
  } catch {
    return false;
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
  return true;
}

export function isLocallySaved(type: SavedKind, targetId: string) {
  return readLocalSaved().some((e) => e.type === type && e.targetId === targetId);
}

/** Adds or removes a device save. Newest first; capped at SAVED_MAX (oldest dropped). Returns false if storage is unavailable. */
export function setLocalSaved(type: SavedKind, targetId: string, on: boolean) {
  const rest = readLocalSaved().filter((e) => !(e.type === type && e.targetId === targetId));
  return writeLocalSaved(on ? [{ type, targetId, savedAt: new Date().toISOString() }, ...rest] : rest);
}

/** Removes the given entries (or everything when omitted). */
export function clearLocalSaved(entries?: { type: string; targetId: string }[]) {
  if (!entries) return writeLocalSaved([]);
  const drop = new Set(entries.map((e) => `${e.type}:${e.targetId}`));
  return writeLocalSaved(readLocalSaved().filter((e) => !drop.has(`${e.type}:${e.targetId}`)));
}

function subscribe(cb: () => void) {
  const onStorage = (e: StorageEvent) => { if (e.key === null || e.key === LOCAL_SAVED_KEY) cb(); };
  window.addEventListener(CHANGE_EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

/** Device saves, hydration-safe (empty during SSR and the first client render). */
export function useLocalSaved(): LocalSavedEntry[] {
  return useSyncExternalStore(subscribe, readLocalSaved, () => EMPTY);
}

/** True only on the client after hydration (false on the server). */
export function useHydrated() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}
function noopSubscribe() { return () => {}; }

/** One-time "Saved on this device" hint for guests. Returns true the first time only. */
export function takeGuestHint() {
  try {
    if (window.localStorage.getItem(LOCAL_SAVED_HINT_KEY)) return false;
    window.localStorage.setItem(LOCAL_SAVED_HINT_KEY, "1");
    return true;
  } catch {
    return false;
  }
}

// ───────── Member saved state (for buttons rendered without server state, e.g. cards) ─────────

type MemberState = { signedIn: boolean; keys: Set<string> };
let memberState: Promise<MemberState> | null = null;

/** Fetched once per page load and shared by every button. */
export function getMemberSavedState(): Promise<MemberState> {
  if (!memberState) {
    memberState = fetch("/api/saved/state/", { credentials: "same-origin", cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) return { signedIn: false, keys: new Set<string>() };
        const j = (await r.json()) as { signedIn: boolean; keys: string[] };
        return { signedIn: !!j.signedIn, keys: new Set(j.keys ?? []) };
      })
      .catch(() => ({ signedIn: false, keys: new Set<string>() }));
  }
  return memberState;
}

/** Keeps the shared member state in step after a toggle. */
export function noteMemberSaved(type: string, targetId: string, saved: boolean) {
  void memberState?.then((s) => { if (saved) s.keys.add(`${type}:${targetId}`); else s.keys.delete(`${type}:${targetId}`); });
}

export function resetMemberSavedState() {
  memberState = null;
}

// ───────── Merge device saves into the signed-in account ─────────

let merging: Promise<MergeResult> | null = null;
export type MergeResult = { ok: boolean; added: number; skipped: number };

/**
 * Sends device saves to the account once; clears them locally on success.
 * Concurrent calls share one request.
 */
export function mergeLocalSaves(): Promise<MergeResult> {
  if (merging) return merging;
  const items = readLocalSaved();
  if (!items.length) return Promise.resolve({ ok: true, added: 0, skipped: 0 });
  merging = fetch("/api/saved/merge/", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  })
    .then(async (r) => {
      if (!r.ok) return { ok: false, added: 0, skipped: 0 };
      const j = (await r.json()) as { added: number; skipped: number };
      clearLocalSaved(items);
      resetMemberSavedState();
      return { ok: true, added: j.added ?? 0, skipped: j.skipped ?? 0 };
    })
    .catch(() => ({ ok: false, added: 0, skipped: 0 }))
    .finally(() => { merging = null; });
  return merging;
}

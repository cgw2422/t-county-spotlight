/**
 * Client helper for "on sign-in, merge guest data into the account once".
 *
 * Usage (client component, only when signed in):
 *   useEffect(() => { runGuestMergeOnce(`prefs:${userId}`, async () => { ...POST...; return true; }); }, [userId]);
 *
 * `fn` reads the guest data from localStorage, sends it to a merge endpoint and
 * clears the local copy on success. Return `false` (or throw) when the merge
 * did not happen so it can be retried on a later page load. Runs at most once
 * per key per browser tab session, and never twice concurrently.
 */
const inFlight = new Map<string, Promise<boolean>>();
const storageKey = (key: string) => `tct_merge:${key}`;

export function runGuestMergeOnce(key: string, fn: () => Promise<boolean | void>): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  try {
    if (window.sessionStorage.getItem(storageKey(key)) === "done") return Promise.resolve(false);
  } catch {}
  const running = inFlight.get(key);
  if (running) return running;
  const p = (async () => {
    await Promise.resolve(); // register in `inFlight` before `fn` runs
    try {
      const ok = (await fn()) !== false;
      if (ok) {
        try { window.sessionStorage.setItem(storageKey(key), "done"); } catch {}
      }
      return ok;
    } catch {
      return false;
    } finally {
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, p);
  return p;
}

/** Safe localStorage access (private mode / blocked storage return null). */
export function readLocal(key: string): string | null {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
export function writeLocal(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {}
}

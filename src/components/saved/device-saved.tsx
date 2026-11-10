"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Smartphone } from "lucide-react";
import { SavedEmpty, SavedSections } from "./saved-sections";
import { clearLocalSaved, mergeLocalSaves, useHydrated, useLocalSaved } from "@/lib/saved-local";
import type { ResolvedSaved } from "@/lib/saved-shared";

/** Guest view of /saved/: resolves the device's saves through the read-only endpoint. */
export function DeviceSaved() {
  const hydrated = useHydrated();
  const local = useLocalSaved();
  const [resolved, setResolved] = useState<Map<string, ResolvedSaved>>(() => new Map());
  const [failed, setFailed] = useState(false);
  const keyOf = (i: { type: string; targetId: string }) => `${i.type}:${i.targetId}`;
  const missing = useMemo(() => local.filter((e) => !resolved.has(keyOf(e))), [local, resolved]);

  useEffect(() => {
    if (!missing.length) return;
    let live = true;
    fetch("/api/saved/resolve/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: local }) })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        const j = (await r.json()) as { items: ResolvedSaved[] };
        if (live) setResolved(new Map(j.items.map((i) => [keyOf(i), i])));
      })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [missing, local]);

  if (!hydrated) return <SavedSkeleton />;
  if (!local.length) return <SavedEmpty />;
  if (failed && !resolved.size) return <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">We couldn&apos;t load your saved items. Check your connection and try again.</p>;
  if (missing.length) return <SavedSkeleton />;

  const items = local.map((e) => resolved.get(keyOf(e))).filter((i): i is ResolvedSaved => !!i);
  return (
    <div className="space-y-6">
      <p className="flex items-start gap-3 rounded-xl bg-brand-50 px-4 py-3 text-sm text-navy-900" data-testid="device-saved-note">
        <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-brand-700" aria-hidden />
        <span>
          These are saved on this device only.{" "}
          <Link href={`/register/?source=save&next=${encodeURIComponent("/saved/")}`} className="font-semibold text-brand-700 underline underline-offset-2">Create a free account</Link>{" "}
          or <Link href={`/login/?next=${encodeURIComponent("/saved/")}`} className="font-semibold text-brand-700 underline underline-offset-2">sign in</Link> to keep them on all your devices.
        </span>
      </p>
      <SavedSections items={items} remove={{ kind: "local", onRemove: (i) => clearLocalSaved([i]) }} />
    </div>
  );
}

function SavedSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading saved items">
      {[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-100" />)}
    </div>
  );
}

/** Members: offer to add saves left on this device (e.g. if the automatic merge didn't run). */
export function DeviceSavesOffer() {
  const hydrated = useHydrated();
  const local = useLocalSaved();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (!hydrated || !local.length) return msg ? <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{msg}</p> : null;
  const n = local.length;
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-navy-900 sm:flex-row sm:items-center sm:justify-between" data-testid="device-saves-offer">
      <span>You have {n} {n === 1 ? "item" : "items"} saved on this device that {n === 1 ? "isn't" : "aren't"} in your account yet.</span>
      <button
        type="button"
        className="btn-primary btn-sm shrink-0"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const r = await mergeLocalSaves();
          setBusy(false);
          if (!r.ok) { setMsg("We couldn't add those items. Please try again."); return; }
          setMsg(r.added ? `Added ${r.added} ${r.added === 1 ? "item" : "items"} to your account.` : "Those items are already in your account.");
          router.refresh();
        }}
      >
        {busy ? "Adding…" : `Add ${n} ${n === 1 ? "item" : "items"} saved on this device to your account`}
      </button>
    </div>
  );
}

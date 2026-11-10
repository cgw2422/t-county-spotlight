"use client";
import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FormMessage, type ActionState } from "@/components/ui/form-message";
import { sendTrack } from "@/components/public/track";
import { readLocal, writeLocal } from "@/lib/guest-merge";
import { ALL_COUNTY, ALL_COUNTY_LABEL, COMMUNITIES, GUEST_PREFS_KEY, INTERESTS, communitySlug, parseGuestPrefs } from "@/lib/my-t-county-shared";
import { saveMemberPrefsAction, setCommunityAction } from "@/app/(site)/my-t-county/actions";
import { PREFS_CHANGED_EVENT } from "./guest-picks";

type Props = { member: boolean; community: string | null; extraCommunities: string[]; interests: string[] };

function Chip({ name, value, checked, onChange, label }: { name: string; value: string; checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-slate-200 bg-white px-3 text-sm font-medium text-navy-900 has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50 has-[:checked]:text-brand-800 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500">
      <input type="checkbox" name={name} value={value} checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-brand-600" />
      {label}
    </label>
  );
}

/**
 * Preferred community, additional communities and favorite categories.
 * Members save to the account; guests save on this device (community in a
 * cookie, the rest in localStorage) until they create an account.
 */
export function PreferencesForm({ member, community, extraCommunities, interests }: Props) {
  const router = useRouter();
  const [home, setHome] = useState(community ? communitySlug(community)! : ALL_COUNTY);
  const [extra, setExtra] = useState<string[]>(extraCommunities);
  const [picked, setPicked] = useState<string[]>(interests);
  const [guestMsg, setGuestMsg] = useState<ActionState>(null);
  const [pending, start] = useTransition();
  const [state, formAction, memberPending] = useActionState(saveMemberPrefsAction, null);

  // Guests: load what this browser remembers.
  useEffect(() => {
    if (member) return;
    const p = parseGuestPrefs(readLocal(GUEST_PREFS_KEY));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from localStorage
    setExtra(p.extraCommunities);
    setPicked(p.interests);
  }, [member]);

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  const toggle = (list: string[], set: (v: string[]) => void, v: string, on: boolean) => set(on ? [...list.filter((x) => x !== v), v] : list.filter((x) => x !== v));
  const homeName = COMMUNITIES.find((c) => c.slug === home)?.name ?? null;

  const saveGuest = (e: React.FormEvent) => {
    e.preventDefault();
    const extras = extra.filter((n) => n !== homeName);
    writeLocal(GUEST_PREFS_KEY, JSON.stringify({ extraCommunities: extras, interests: picked, updatedAt: Date.now() }));
    window.dispatchEvent(new Event(PREFS_CHANGED_EVENT));
    const changed = home !== (community ? communitySlug(community) : ALL_COUNTY);
    start(async () => {
      if (changed) {
        const r = await setCommunityAction(home);
        if (r.ok) sendTrack({ type: "set_community", targetType: "COMMUNITY", targetId: r.community ? communitySlug(r.community)! : ALL_COUNTY });
        router.refresh();
      }
      setGuestMsg({ message: "Saved on this device." });
    });
  };

  const busy = pending || memberPending;
  return (
    <form action={member ? formAction : undefined} onSubmit={member ? undefined : saveGuest} className="space-y-6" data-testid="prefs-form">
      <div>
        <label htmlFor="pref-community" className="label">Preferred community</label>
        <select id="pref-community" name="community" value={home} onChange={(e) => setHome(e.target.value)} className="input max-w-sm">
          <option value={ALL_COUNTY}>{ALL_COUNTY_LABEL}</option>
          <optgroup label="Main towns">{COMMUNITIES.filter((c) => c.main).map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}</optgroup>
          <optgroup label="Other communities">{COMMUNITIES.filter((c) => !c.main).map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}</optgroup>
        </select>
        <p className="help">Content from this community shows first. Countywide news and updates always stay visible.</p>
      </div>

      <fieldset>
        <legend className="label">Additional communities of interest</legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {COMMUNITIES.filter((c) => c.main && c.slug !== home).map((c) => (
            <Chip key={c.slug} name="extra" value={c.name} label={c.name} checked={extra.includes(c.name)} onChange={(on) => toggle(extra, setExtra, c.name, on)} />
          ))}
        </div>
        <details className="mt-3" open={extra.some((n) => !COMMUNITIES.find((c) => c.name === n)?.main)}>
          <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-brand-700">More Tuscarawas County communities</summary>
          <div className="mt-2 flex flex-wrap gap-2">
            {COMMUNITIES.filter((c) => !c.main && c.slug !== home).map((c) => (
              <Chip key={c.slug} name="extra" value={c.name} label={c.name} checked={extra.includes(c.name)} onChange={(on) => toggle(extra, setExtra, c.name, on)} />
            ))}
          </div>
        </details>
      </fieldset>

      <fieldset>
        <legend className="label">Favorite categories</legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {INTERESTS.map((i) => (
            <Chip key={i.key} name="interests" value={i.key} label={i.label} checked={picked.includes(i.key)} onChange={(on) => toggle(picked, setPicked, i.key, on)} />
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn-primary" disabled={busy}>{busy ? "Saving…" : member ? "Save preferences" : "Save on this device"}</button>
        {!member && <span className="text-sm text-slate-500">Saved in this browser only.</span>}
      </div>
      <FormMessage state={member ? state : guestMsg} />
    </form>
  );
}

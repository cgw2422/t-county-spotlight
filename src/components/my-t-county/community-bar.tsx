"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MapPin, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { sendTrack } from "@/components/public/track";
import { ALL_COUNTY, ALL_COUNTY_LABEL, ALL_COUNTY_SHORT, COMMUNITIES, communitySlug } from "@/lib/my-t-county-shared";
import { dismissCommunityPromptAction, setCommunityAction, setScopeAction } from "@/app/(site)/my-t-county/actions";

type Props = {
  /** Preferred community (null = All of Tuscarawas County). */
  community: string | null;
  /** Community currently used for ordering (null when showing the whole county). */
  active: string | null;
  showPrompt?: boolean;
  className?: string;
};

function CommunitySelect({ id, value, onChange, disabled, label }: { id: string; value: string; onChange: (v: string) => void; disabled?: boolean; label: string }) {
  return (
    <>
      <label htmlFor={id} className="sr-only">{label}</label>
      <select id={id} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}
        className="min-h-11 max-w-full rounded-lg border border-slate-300 bg-white px-3 pr-8 text-sm font-semibold text-navy-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30">
        {value === "" && <option value="">Choose a community…</option>}
        <optgroup label="Main towns">
          {COMMUNITIES.filter((c) => c.main).map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
        </optgroup>
        <optgroup label="Other Tuscarawas County communities">
          {COMMUNITIES.filter((c) => !c.main).map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
        </optgroup>
        <option value={ALL_COUNTY}>{ALL_COUNTY_LABEL}</option>
      </select>
    </>
  );
}

/**
 * Community prompt (once, dismissible, never blocking) or the compact
 * "Showing: Dover / All of T County" switcher. No location access is used.
 */
export function CommunityBar({ community, active, showPrompt = false, className }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [hidden, setHidden] = useState(false);

  const choose = (value: string) => {
    if (!value) return;
    start(async () => {
      const r = await setCommunityAction(value);
      if (r.ok) sendTrack({ type: "set_community", targetType: "COMMUNITY", targetId: r.community ? communitySlug(r.community)! : ALL_COUNTY });
      router.refresh();
    });
  };
  const scope = (s: "community" | "all") => start(async () => { await setScopeAction(s); router.refresh(); });

  if (showPrompt && !hidden) {
    return (
      <section aria-label="Choose your community" data-testid="community-prompt" className={cn("container-page", className)}>
        <div className="relative flex flex-col gap-3 rounded-2xl border border-brand-100 bg-brand-50/60 p-4 pr-12 sm:flex-row sm:flex-wrap sm:items-center">
          <p className="flex items-center gap-2 text-sm font-semibold text-navy-900"><MapPin className="h-4 w-4 shrink-0 text-brand-700" aria-hidden /> Show me what&rsquo;s happening in:</p>
          <div className="flex flex-wrap items-center gap-2">
            <CommunitySelect id="cp-community" label="Your community" value="" onChange={choose} disabled={pending} />
            <span className="text-sm text-slate-500" aria-hidden>·</span>
            <button type="button" disabled={pending} onClick={() => choose(ALL_COUNTY)} className="min-h-11 rounded-lg px-3 text-sm font-semibold text-brand-700 hover:bg-white">{ALL_COUNTY_LABEL}</button>
          </div>
          <button type="button" disabled={pending} onClick={() => { setHidden(true); start(async () => { await dismissCommunityPromptAction(); }); }}
            className="min-h-11 self-start rounded-lg px-3 text-sm font-medium text-slate-600 hover:bg-white sm:ml-auto sm:self-auto" data-testid="community-prompt-dismiss">
            Not now
          </button>
          <button type="button" aria-label="Dismiss" disabled={pending} onClick={() => { setHidden(true); start(async () => { await dismissCommunityPromptAction(); }); }}
            className="absolute right-1 top-1 flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 hover:bg-white">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </section>
    );
  }

  return (
    <div data-testid="community-switcher" className={cn("container-page", className)}>
      <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 text-sm", pending && "opacity-70")} aria-busy={pending}>
        <span className="flex items-center gap-1.5 font-semibold text-slate-600"><MapPin className="h-4 w-4 text-brand-700" aria-hidden /> Showing:</span>
        {community ? (
          <div role="group" aria-label="Show content for" className="inline-flex rounded-xl border border-slate-200 bg-white p-0.5">
            <button type="button" aria-pressed={!!active} disabled={pending} onClick={() => scope("community")}
              className={cn("min-h-10 rounded-lg px-3 font-semibold", active ? "bg-navy-900 text-white" : "text-navy-900 hover:bg-slate-100")}>{community}</button>
            <button type="button" aria-pressed={!active} disabled={pending} onClick={() => scope("all")}
              className={cn("min-h-10 rounded-lg px-3 font-semibold", !active ? "bg-navy-900 text-white" : "text-navy-900 hover:bg-slate-100")}>{ALL_COUNTY_SHORT}</button>
          </div>
        ) : (
          <span className="font-semibold text-navy-900">{ALL_COUNTY_LABEL}</span>
        )}
        <span className="flex min-w-0 items-center gap-2">
          <span aria-hidden className="text-slate-500">{community ? "Change:" : "Choose:"}</span>
          <CommunitySelect id="cs-community" label={community ? "Change your community" : "Choose your community"}
            value={community ? communitySlug(community)! : ALL_COUNTY} onChange={choose} disabled={pending} />
        </span>
      </div>
    </div>
  );
}

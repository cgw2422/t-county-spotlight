import Link from "next/link";
import { MessagesSquare } from "lucide-react";
import { getPulseMentions, mentionsLabel, pulseHref } from "@/lib/pulse";

/**
 * "Mentioned in Community Pulse" for a business or organization profile.
 * Mention counts are community responses — separate from reviews and memberships.
 * Renders nothing when the listing isn't in any public entry.
 */
export async function PulseMentions({ businessId, organizationId, name, className }: { businessId?: string; organizationId?: string; name: string; className?: string }) {
  if (!businessId && !organizationId) return null;
  const rows = await getPulseMentions(businessId ? { businessId } : { organizationId });
  if (!rows.length) return null;
  return (
    <section aria-labelledby="pulse-mentions-title" className={className}>
      <h2 id="pulse-mentions-title" className="section-title">Mentioned in Community Pulse</h2>
      <p className="mt-1 text-slate-600">{name} came up in these community conversations. Counts reflect community responses, not reviews or endorsements.</p>
      <ul className="mt-4 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {rows.map((r) => (
          <li key={r.pulse.id}>
            <Link href={pulseHref(r.pulse)} className="flex items-center gap-3 p-4 hover:bg-slate-50">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-hillside-50 text-hillside-700"><MessagesSquare className="h-5 w-5" aria-hidden /></span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-navy-900">{r.pulse.title}</span>
                <span className="block text-sm text-slate-500">
                  {r.pulse.displayMode !== "EDITORIAL_LIST" && r.mentions != null ? mentionsLabel(r.mentions) : "Community recommendation"}
                  {r.pulse.status === "ARCHIVED" ? " · Archived" : ""}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

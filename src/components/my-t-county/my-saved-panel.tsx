import Link from "next/link";
import { Bookmark, ChevronRight } from "lucide-react";
import { getSavedSummary } from "@/lib/saved";
import { SmartImage } from "@/components/ui/smart-image";
import { OhioMark } from "@/components/site/logo";

const TYPE_LABEL: Record<string, string> = {
  EVENT: "Event", BUSINESS: "Business", PROMOTION: "Special", GARAGE_SALE: "Garage sale", ARTICLE: "Article", PULSE: "Community Pulse", ORGANIZATION: "Organization",
};
const typeLabel = (t: string) => TYPE_LABEL[t] ?? "";

function SavedLinkCard() {
  return (
    <Link href="/saved/" className="card card-hover flex items-center gap-4 p-4" data-testid="mtc-saved-link">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><Bookmark className="h-5 w-5" aria-hidden /></span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-navy-900">Your saved events, businesses and more</span>
        <span className="block text-sm text-slate-600">Everything you&rsquo;ve saved, with ended events and sales clearly marked.</span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" aria-hidden />
    </Link>
  );
}

/** Members: a few saved items + link to /saved/. Guests: link to /saved/ (device saves live in the browser). */
export async function MySavedPanel({ userId }: { userId: string | null }) {
  if (!userId) return <SavedLinkCard />;
  const items = await getSavedSummary(userId, 4);
  if (!items.length) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-600" data-testid="mtc-saved-empty">Nothing saved yet. Tap the save button on events, businesses, garage sales and more to keep them here.</p>
        <SavedLinkCard />
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <ul className="card divide-y divide-slate-100" data-testid="mtc-saved-list">
        {items.map((i) => {
          const body = (
            <>
              <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-navy-800">
                {i.image ? <SmartImage src={i.image} alt="" fill sizes="48px" className="object-cover" /> : <span className="flex h-full w-full items-center justify-center text-white/70"><OhioMark className="h-5 w-5" /></span>}
              </span>
              <span className="min-w-0 flex-1">
                <span className="line-clamp-1 font-semibold text-navy-900">{i.title}</span>
                <span className="block truncate text-sm text-slate-500">
                  {[typeLabel(i.type), i.dateLabel, i.location].filter(Boolean).join(" · ")}
                </span>
              </span>
              {i.ended && <span className="badge-gray shrink-0">Ended</span>}
            </>
          );
          return (
            <li key={`${i.type}:${i.targetId}`}>
              {i.href ? <Link href={i.href} className="flex min-h-14 items-center gap-3 p-3 hover:bg-slate-50">{body}</Link> : <div className="flex min-h-14 items-center gap-3 p-3">{body}</div>}
            </li>
          );
        })}
      </ul>
      <Link href="/saved/" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-brand-700 hover:text-brand-600">See everything you&rsquo;ve saved <ChevronRight className="h-4 w-4" aria-hidden /></Link>
    </div>
  );
}

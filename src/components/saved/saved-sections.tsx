"use client";
import Link from "next/link";
import { Bookmark, Building2, CalendarDays, FileText, MessagesSquare, Store, Tag, Trash2, Truck, type LucideIcon } from "lucide-react";
import { SmartImage } from "@/components/ui/smart-image";
import { EmptyState } from "@/components/ui/empty-state";
import { OhioMark } from "@/components/site/logo";
import { cn } from "@/lib/utils";
import { SAVED_SECTIONS, type ResolvedSaved, type SavedKind } from "@/lib/saved-shared";

const ICONS: Record<SavedKind, LucideIcon> = {
  EVENT: CalendarDays, BUSINESS: Store, PROMOTION: Tag, GARAGE_SALE: Tag, ARTICLE: FileText, PULSE: MessagesSquare, ORGANIZATION: Building2,
};

/** Display order within a section: current first (soonest / newest), then past and unavailable ("Past"). */
function order(items: ResolvedSaved[]) {
  const dated = (t: SavedKind) => t === "EVENT" || t === "GARAGE_SALE" || t === "PROMOTION";
  const newest = (a: ResolvedSaved, b: ResolvedSaved) => (b.savedAt ? Date.parse(b.savedAt) : 0) - (a.savedAt ? Date.parse(a.savedAt) : 0);
  const current = items.filter((i) => i.available && !i.ended).sort((a, b) => (dated(a.type) ? a.sortAt - b.sortAt : newest(a, b)));
  const past = [
    ...items.filter((i) => i.available && i.ended).sort((a, b) => (dated(a.type) ? a.sortAt - b.sortAt : newest(a, b))),
    ...items.filter((i) => !i.available).sort(newest),
  ];
  return { current, past };
}

export type RemoveHandler =
  | { kind: "action"; action: (fd: FormData) => void | Promise<void> }
  | { kind: "local"; onRemove: (item: ResolvedSaved) => void };

function RemoveButton({ item, remove, labeled }: { item: ResolvedSaved; remove: RemoveHandler; labeled: boolean }) {
  const name = item.available ? item.title : "this item";
  const cls = cn(labeled ? "btn-secondary btn-sm" : "btn-ghost px-3 text-slate-500 hover:text-red-600");
  const content = <>{labeled ? "Remove" : <Trash2 className="h-5 w-5" aria-hidden />}</>;
  if (remove.kind === "action") {
    return (
      <form action={remove.action}>
        <input type="hidden" name="type" value={item.type} />
        <input type="hidden" name="targetId" value={item.targetId} />
        <button type="submit" className={cls} aria-label={`Remove ${name} from saved`} data-testid="saved-remove">{content}</button>
      </form>
    );
  }
  return <button type="button" onClick={() => remove.onRemove(item)} className={cls} aria-label={`Remove ${name} from saved`} data-testid="saved-remove">{content}</button>;
}

function SavedCard({ item, remove }: { item: ResolvedSaved; remove: RemoveHandler }) {
  const over = !item.available || item.ended;
  const Icon = ICONS[item.type];
  const body = (
    <>
      <span className={cn("relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-navy-800", over && "opacity-50 grayscale")}>
        {item.image
          ? <SmartImage src={item.image} alt="" fill sizes="64px" className="object-cover" />
          : <span className="flex h-full w-full items-center justify-center text-white/70">{item.available ? <Icon className="h-6 w-6" aria-hidden /> : <OhioMark className="h-6 w-6" />}</span>}
      </span>
      <span className={cn("min-w-0 flex-1", over && "opacity-70")}>
        <span className="flex flex-wrap items-center gap-1.5">
          {item.statusLabel && <span className={item.available ? "badge-amber" : "badge-gray"} data-testid="saved-status">{item.statusLabel}</span>}
          {item.badge && <span className={item.badge === "Food truck" ? "badge-orange" : "badge-blue"}>{item.badge === "Food truck" && <Truck className="h-3 w-3" aria-hidden />} {item.badge}</span>}
        </span>
        <span className="mt-0.5 line-clamp-2 break-words font-semibold text-navy-900">{item.available ? item.title : "This saved item is no longer available"}</span>
        {item.dateLabel && <span className="block text-sm text-slate-600">{item.dateLabel}</span>}
        {item.location && <span className="block truncate text-sm text-slate-500">{item.location}</span>}
        {item.detail && <span className="line-clamp-2 block break-words text-xs text-slate-500">{item.detail}</span>}
      </span>
    </>
  );
  return (
    <li className="flex items-center gap-2 p-3" data-testid="saved-item" data-type={item.type} data-target={item.targetId} data-ended={over ? "1" : "0"}>
      {item.href
        ? <Link href={item.href} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg">{body}</Link>
        : <span className="flex min-w-0 flex-1 items-center gap-3">{body}</span>}
      <RemoveButton item={item} remove={remove} labeled={over} />
    </li>
  );
}

/** Grouped saved items with jump links. Shared by the member and device (guest) views. */
export function SavedSections({ items, remove }: { items: ResolvedSaved[]; remove: RemoveHandler }) {
  if (!items.length) return <SavedEmpty />;
  const sections = SAVED_SECTIONS.map((s) => ({ ...s, ...order(items.filter((i) => i.type === s.type)) })).filter((s) => s.current.length + s.past.length > 0);
  return (
    <div className="space-y-8">
      <nav aria-label="Saved sections" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex gap-2 pb-1 sm:flex-wrap">
          {sections.map((s) => (
            <li key={s.type} className="shrink-0">
              <a href={`#saved-${s.slug}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-navy-900 hover:border-brand-300 hover:text-brand-700">
                {s.title} <span className="text-slate-500">{s.current.length + s.past.length}</span>
              </a>
            </li>
          ))}
        </ul>
      </nav>
      {sections.map((s) => {
        const Icon = ICONS[s.type];
        return (
          <section key={s.type} id={`saved-${s.slug}`} aria-labelledby={`saved-${s.slug}-h`} className="scroll-mt-24" data-testid={`saved-section-${s.type}`}>
            <h2 id={`saved-${s.slug}-h`} className="mb-3 flex items-center gap-2 font-display text-lg font-bold text-navy-900">
              <Icon className="h-5 w-5 text-slate-400" aria-hidden /> {s.title} <span className="badge-gray">{s.current.length + s.past.length}</span>
            </h2>
            {s.current.length > 0 && <ul className="card divide-y divide-slate-100">{s.current.map((i) => <SavedCard key={`${i.type}:${i.targetId}`} item={i} remove={remove} />)}</ul>}
            {s.past.length > 0 && (
              <>
                <h3 className={cn("mb-2 text-xs font-bold uppercase tracking-wide text-slate-500", s.current.length > 0 && "mt-4")}>Past</h3>
                <ul className="card divide-y divide-slate-100 bg-slate-50/60" data-testid={`saved-past-${s.type}`}>{s.past.map((i) => <SavedCard key={`${i.type}:${i.targetId}`} item={i} remove={remove} />)}</ul>
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}

export function SavedEmpty() {
  return (
    <EmptyState icon={Bookmark} title="Nothing saved yet">
      Tap the heart on events, businesses, food trucks, garage sales, specials and stories to keep them here.
      <span className="mt-4 flex flex-wrap justify-center gap-2">
        <Link href="/events/" className="btn-primary btn-sm">Events</Link>
        <Link href="/food-trucks/" className="btn-secondary btn-sm">Food trucks</Link>
        <Link href="/garage-sales/" className="btn-secondary btn-sm">Garage sales</Link>
        <Link href="/businesses/" className="btn-secondary btn-sm">Businesses</Link>
      </span>
    </EmptyState>
  );
}

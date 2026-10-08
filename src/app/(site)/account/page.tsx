import Link from "next/link";
import { Bookmark, CalendarDays, FileText, Store, Tag, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { articleHref, businessHref, eventHref, specialHref } from "@/lib/links";
import { formatDate, formatDateTime } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { SmartImage } from "@/components/ui/smart-image";
import { OhioMark } from "@/components/site/logo";
import { removeSavedAction } from "./actions";

export const dynamic = "force-dynamic";

type Row = { savedId: string; href: string; title: string; meta: string; image: string | null; past?: boolean };

function SavedRow({ r }: { r: Row }) {
  return (
    <li className="flex items-center gap-3 p-3">
      <Link href={r.href} className="flex min-w-0 flex-1 items-center gap-3">
        <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-navy-800">
          {r.image ? <SmartImage src={r.image} alt="" fill sizes="56px" className="object-cover" /> : <span className="flex h-full w-full items-center justify-center text-white/70"><OhioMark className="h-6 w-6" /></span>}
        </span>
        <span className="min-w-0">
          <span className="line-clamp-2 font-semibold text-navy-900">{r.title}</span>
          <span className="block truncate text-sm text-slate-500">{r.meta}{r.past && " · Past"}</span>
        </span>
      </Link>
      <form action={removeSavedAction}>
        <input type="hidden" name="id" value={r.savedId} />
        <button type="submit" className="btn-ghost px-3 text-slate-500 hover:text-red-600" aria-label={`Remove ${r.title} from saved`}><Trash2 className="h-5 w-5" /></button>
      </form>
    </li>
  );
}

export default async function SavedPage({ searchParams }: { searchParams: Promise<{ welcome?: string; password?: string }> }) {
  const user = await getCurrentUser();
  if (!user) return null;
  const sp = await searchParams;
  const saved = await db.savedItem.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
  const ids = (t: string) => saved.filter((s) => s.type === t).map((s) => s.targetId);
  const [businesses, events, promos, articles] = await Promise.all([
    db.business.findMany({ where: { id: { in: ids("BUSINESS") }, deletedAt: null, status: "PUBLISHED" }, select: { id: true, slug: true, name: true, city: true, logoUrl: true, coverUrl: true } }),
    db.event.findMany({ where: { id: { in: ids("EVENT") }, deletedAt: null, status: "PUBLISHED" }, select: { id: true, slug: true, title: true, startAt: true, endAt: true, imageUrl: true, city: true } }),
    db.promotion.findMany({ where: { id: { in: ids("PROMOTION") }, deletedAt: null, status: "APPROVED" }, select: { id: true, slug: true, title: true, imageUrl: true, endsAt: true, business: { select: { name: true } } } }),
    db.article.findMany({ where: { id: { in: ids("ARTICLE") }, deletedAt: null, status: "PUBLISHED" }, select: { id: true, slug: true, legacyPath: true, title: true, featuredImageUrl: true, publishedAt: true } }),
  ]);
  const now = new Date();
  const savedId = (type: string, id: string) => saved.find((s) => s.type === type && s.targetId === id)!.id;
  const groups: { key: string; title: string; icon: typeof Store; rows: Row[] }[] = [
    { key: "BUSINESS", title: "Businesses", icon: Store, rows: businesses.map((b) => ({ savedId: savedId("BUSINESS", b.id), href: businessHref(b), title: b.name, meta: b.city || "Tuscarawas County", image: b.logoUrl || b.coverUrl })) },
    { key: "EVENT", title: "Events", icon: CalendarDays, rows: events.sort((a, b) => a.startAt.getTime() - b.startAt.getTime()).map((e) => ({ savedId: savedId("EVENT", e.id), href: eventHref(e), title: e.title, meta: formatDateTime(e.startAt) + (e.city ? ` · ${e.city}` : ""), image: e.imageUrl, past: (e.endAt ?? e.startAt) < now })) },
    { key: "PROMOTION", title: "Specials", icon: Tag, rows: promos.map((p) => ({ savedId: savedId("PROMOTION", p.id), href: specialHref(p), title: p.title, meta: p.business.name + (p.endsAt ? ` · Ends ${formatDate(p.endsAt, { month: "short", day: "numeric" })}` : ""), image: p.imageUrl, past: !!p.endsAt && p.endsAt < now })) },
    { key: "ARTICLE", title: "Stories", icon: FileText, rows: articles.map((a) => ({ savedId: savedId("ARTICLE", a.id), href: articleHref(a), title: a.title, meta: formatDate(a.publishedAt), image: a.featuredImageUrl })) },
  ];
  const total = groups.reduce((n, g) => n + g.rows.length, 0);

  return (
    <div className="space-y-8">
      {sp.welcome && <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Welcome to TCountySpotlight! Tap the bookmark on any business, event, special or story to save it here.</p>}
      {sp.password && <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Your new password is saved and you&apos;re signed in.</p>}
      {total === 0 ? (
        <EmptyState icon={Bookmark} title="Nothing saved yet">
          Tap the save button on businesses, events, specials and stories to keep them here.
          <span className="mt-4 flex flex-wrap justify-center gap-2">
            <Link href="/events/" className="btn-primary btn-sm">Browse events</Link>
            <Link href="/businesses/" className="btn-secondary btn-sm">Find businesses</Link>
          </span>
        </EmptyState>
      ) : (
        groups.filter((g) => g.rows.length).map(({ key, title, icon: Icon, rows }) => (
          <section key={key} aria-labelledby={`saved-${key}`}>
            <h2 id={`saved-${key}`} className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500"><Icon className="h-4 w-4" aria-hidden /> {title} <span className="badge-gray">{rows.length}</span></h2>
            <ul className="card divide-y divide-slate-100">{rows.map((r) => <SavedRow key={r.savedId} r={r} />)}</ul>
          </section>
        ))
      )}
    </div>
  );
}

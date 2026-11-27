import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { buildMetadata } from "@/components/public/seo";
import { articleHref } from "@/lib/links";
import { publicGovWatchEnabled } from "@/lib/gov-watch/settings";
import { communityFromSlug, PUBLIC_DOC, PUBLIC_FINDING, upcomingPublicMeetings } from "@/lib/gov-watch/public";
import { ACTION_STATUS_LABEL, ACTION_STATUSES, DOC_TYPE_LABEL, DOC_TYPES, isOneOf } from "@/lib/gov-watch/shared";

export const dynamic = "force-dynamic";
const fmt = (d: Date | null) => (d ? new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(d) : "");

export async function generateMetadata({ params }: { params: Promise<{ community: string }> }): Promise<Metadata> {
  const c = (await publicGovWatchEnabled()) ? await communityFromSlug((await params).community) : null;
  if (!c) return { title: "Not found", robots: { index: false } };
  return buildMetadata({ title: `${c.name} Government Watch`, description: `Local government meetings, summaries and public records for ${c.name}.`, path: `/government-watch/${c.slug}/` });
}

export default async function CommunityGovPage({ params }: { params: Promise<{ community: string }> }) {
  if (!(await publicGovWatchEnabled())) notFound();
  const c = await communityFromSlug((await params).community);
  if (!c) notFound();
  const [docs, stories, upcoming] = await Promise.all([
    db.govDocument.findMany({ where: { ...PUBLIC_DOC, source: { community: c.name } }, orderBy: [{ meetingDate: { sort: "desc", nulls: "last" } }], take: 30, select: { id: true, title: true, docType: true, meetingDate: true, summary: true, source: { select: { name: true } } } }),
    db.govFinding.findMany({ where: { ...PUBLIC_FINDING, document: { source: { community: c.name } } }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, headline: true, detail: true, actionStatus: true, articleId: true, document: { select: { id: true } } } }),
    upcomingPublicMeetings(c.name),
  ]);
  const articleIds = [...new Set(stories.map((s) => s.articleId).filter((x): x is string => !!x))];
  const articles = articleIds.length ? await db.article.findMany({ where: { id: { in: articleIds }, status: "PUBLISHED", deletedAt: null }, select: { id: true, title: true, slug: true, legacyPath: true } }) : [];
  return (
    <div className="container-page py-10">
      <Link href="/government-watch/" className="text-sm text-brand-700 hover:underline">← Government Watch</Link>
      <h1 className="mt-2 font-display text-4xl font-bold text-navy-900">{c.name} Government Watch</h1>
      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-8">
          <section>
            <h2 className="section-title">Recent actions</h2>
            {stories.length ? <ul className="mt-4 space-y-3">{stories.map((s) => <li key={s.id} className="card p-4"><span className="badge-gray">{isOneOf(ACTION_STATUSES, s.actionStatus) ? ACTION_STATUS_LABEL[s.actionStatus] : s.actionStatus}</span><h3 className="mt-1 font-display font-bold text-navy-900">{s.headline}</h3><p className="mt-1 text-slate-700">{s.detail}</p><Link href={`/government-watch/documents/${s.document.id}/`} className="mt-1 inline-block text-sm text-brand-700 hover:underline">From the meeting record →</Link></li>)}</ul> : <p className="mt-3 text-slate-600">Nothing yet.</p>}
          </section>
          <section>
            <h2 className="section-title">Meeting summaries & records</h2>
            {docs.length ? <ul className="mt-4 space-y-3">{docs.map((d) => <li key={d.id} className="card p-4"><p className="eyebrow">{d.source?.name}{d.meetingDate ? ` · ${fmt(d.meetingDate)}` : ""}</p><h3 className="mt-1 font-display font-bold text-navy-900"><Link href={`/government-watch/documents/${d.id}/`} className="hover:underline">{isOneOf(DOC_TYPES, d.docType) ? DOC_TYPE_LABEL[d.docType] : "Document"}: {d.title}</Link></h3>{d.summary && <p className="mt-1 text-slate-700">{d.summary}</p>}</li>)}</ul> : <p className="mt-3 text-slate-600">Nothing yet.</p>}
          </section>
        </div>
        <aside className="space-y-6">
          <section className="card p-5"><h2 className="font-display text-lg font-bold text-navy-900">Upcoming public meetings</h2>{upcoming.length ? <ul className="mt-3 space-y-3 text-sm">{upcoming.map((u) => <li key={u.id}><span className="font-semibold">{fmt(u.eventDate)}</span><span className="block">{u.headline}</span></li>)}</ul> : <p className="mt-3 text-sm text-slate-600">None listed right now.</p>}</section>
          {articles.length > 0 && <section className="card p-5"><h2 className="font-display text-lg font-bold text-navy-900">Related news</h2><ul className="mt-3 space-y-2 text-sm">{articles.map((a) => <li key={a.id}><Link href={articleHref(a)} className="text-brand-700 hover:underline">{a.title}</Link></li>)}</ul></section>}
        </aside>
      </div>
    </div>
  );
}

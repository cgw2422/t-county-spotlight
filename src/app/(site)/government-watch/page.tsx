import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, FileText, Landmark } from "lucide-react";
import { db } from "@/lib/db";
import { buildMetadata } from "@/components/public/seo";
import { publicGovWatchEnabled } from "@/lib/gov-watch/settings";
import { PUBLIC_DOC, publicCommunities, upcomingPublicMeetings } from "@/lib/gov-watch/public";
import { DOC_TYPE_LABEL, DOC_TYPES, isOneOf } from "@/lib/gov-watch/shared";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  if (!(await publicGovWatchEnabled())) return { title: "Not found", robots: { index: false } };
  return buildMetadata({ title: "Government Watch", description: "Local government meetings across Tuscarawas County: meeting summaries, original minutes and agendas, and upcoming public meetings.", path: "/government-watch/" });
}

const fmt = (d: Date | null) => (d ? new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(d) : "");

export default async function GovernmentWatchPage() {
  if (!(await publicGovWatchEnabled())) notFound();
  const [communities, upcoming, recent] = await Promise.all([
    publicCommunities(),
    upcomingPublicMeetings(),
    db.govDocument.findMany({ where: PUBLIC_DOC, orderBy: [{ meetingDate: { sort: "desc", nulls: "last" } }], take: 12, select: { id: true, title: true, docType: true, meetingDate: true, summary: true, source: { select: { name: true } } } }),
  ]);
  return (
    <>
      <section className="bg-gradient-to-b from-navy-900 to-navy-800 text-white">
        <div className="container-page py-12 sm:py-16">
          <p className="eyebrow text-sunset-400">Government Watch</p>
          <h1 className="mt-2 font-display text-4xl font-bold text-balance sm:text-5xl">What Your Local Governments Are Doing</h1>
          <p className="mt-4 max-w-2xl text-lg text-slate-200">Meeting summaries, original minutes and agendas, and upcoming public meetings from councils, trustees, school boards and county offices across Tuscarawas County. Every summary is reviewed by our team, and every item links to the original public record.</p>
        </div>
      </section>
      <div className="container-page grid gap-10 py-10 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <h2 className="section-title">Recent meetings</h2>
          {recent.length ? (
            <ul className="mt-4 space-y-4">
              {recent.map((d) => (
                <li key={d.id} className="card p-5">
                  <p className="eyebrow">{d.source?.name}{d.meetingDate ? ` · ${fmt(d.meetingDate)}` : ""}</p>
                  <h3 className="mt-1 font-display text-lg font-bold text-navy-900"><Link href={`/government-watch/documents/${d.id}/`} className="hover:underline">{isOneOf(DOC_TYPES, d.docType) ? DOC_TYPE_LABEL[d.docType] : "Document"}: {d.title}</Link></h3>
                  {d.summary && <p className="mt-2 text-slate-700">{d.summary}</p>}
                </li>
              ))}
            </ul>
          ) : <p className="mt-4 text-slate-600">Meeting summaries will appear here soon.</p>}
        </div>
        <aside className="space-y-6">
          <section className="card p-5">
            <h2 className="flex items-center gap-2 font-display text-lg font-bold text-navy-900"><Landmark className="h-5 w-5" /> By community</h2>
            <ul className="mt-3 grid grid-cols-2 gap-2 text-sm">
              {communities.map((c) => <li key={c.slug}><Link href={`/government-watch/${c.slug}/`} className="text-brand-700 hover:underline">{c.name}</Link>{c.docs ? <span className="text-slate-500"> ({c.docs})</span> : null}</li>)}
            </ul>
          </section>
          <section className="card p-5">
            <h2 className="flex items-center gap-2 font-display text-lg font-bold text-navy-900"><CalendarClock className="h-5 w-5" /> Upcoming public meetings</h2>
            {upcoming.length ? <ul className="mt-3 space-y-3 text-sm">{upcoming.map((u) => <li key={u.id}><span className="font-semibold text-navy-900">{fmt(u.eventDate)}</span><span className="block">{u.headline}</span><span className="text-xs text-slate-500">{u.document.source?.name}</span></li>)}</ul> : <p className="mt-3 text-sm text-slate-600">None listed right now.</p>}
          </section>
          <p className="flex gap-2 text-xs text-slate-500"><FileText className="h-4 w-4 shrink-0" /> Summaries are prepared with the help of AI from public records and reviewed by T County Connect. The original record is always the official version.</p>
        </aside>
      </div>
    </>
  );
}

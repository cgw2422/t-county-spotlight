import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, ExternalLink } from "lucide-react";
import { db } from "@/lib/db";
import { buildMetadata } from "@/components/public/seo";
import { publicGovWatchEnabled } from "@/lib/gov-watch/settings";
import { communitySlug, PUBLIC_DOC, PUBLIC_FINDING } from "@/lib/gov-watch/public";
import { ACTION_STATUS_LABEL, ACTION_STATUSES, DOC_TYPE_LABEL, DOC_TYPES, isOneOf } from "@/lib/gov-watch/shared";

export const dynamic = "force-dynamic";
const fmt = (d: Date | null) => (d ? new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(d) : "");

async function load(id: string) {
  if (!(await publicGovWatchEnabled())) return null;
  return db.govDocument.findFirst({ where: { id, ...PUBLIC_DOC }, include: { source: { select: { name: true, community: true } }, findings: { where: PUBLIC_FINDING, orderBy: { createdAt: "asc" } } } });
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const d = await load((await params).id);
  if (!d) return { title: "Not found", robots: { index: false } };
  return buildMetadata({ title: `${d.source?.name ?? "Meeting"}: ${d.title}`, description: d.summary?.slice(0, 200) ?? undefined, path: `/government-watch/documents/${d.id}/` });
}

export default async function PublicGovDocument({ params }: { params: Promise<{ id: string }> }) {
  const d = await load((await params).id);
  if (!d) notFound();
  return (
    <div className="container-page max-w-3xl py-10">
      <Link href={d.source ? `/government-watch/${communitySlug(d.source.community)}/` : "/government-watch/"} className="text-sm text-brand-700 hover:underline">← {d.source?.community ?? "Government Watch"}</Link>
      <p className="eyebrow mt-4">{d.source?.name}{d.meetingDate ? ` · ${fmt(d.meetingDate)}` : ""}</p>
      <h1 className="mt-1 font-display text-3xl font-bold text-navy-900">{isOneOf(DOC_TYPES, d.docType) ? DOC_TYPE_LABEL[d.docType] : "Document"}: {d.title}</h1>
      <div className="mt-4 flex flex-wrap gap-2">
        <a href={d.storageUrl} className="btn-primary btn-sm" target="_blank" rel="noopener noreferrer"><Download className="h-4 w-4" /> Original record</a>
        {d.sourceUrl && <a href={d.sourceUrl} className="btn-secondary btn-sm" target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" /> On the government website</a>}
      </div>
      {d.summary && <section className="mt-8"><h2 className="section-title">Summary</h2><p className="mt-3 text-lg leading-relaxed text-slate-700">{d.summary}</p></section>}
      {d.findings.length > 0 && (
        <section className="mt-8"><h2 className="section-title">Key items</h2>
          <ul className="mt-4 space-y-3">{d.findings.map((f) => <li key={f.id} className="card p-4"><span className="badge-gray">{isOneOf(ACTION_STATUSES, f.actionStatus) ? ACTION_STATUS_LABEL[f.actionStatus] : f.actionStatus}</span><h3 className="mt-1 font-display font-bold text-navy-900">{f.headline}</h3><p className="mt-1 text-slate-700">{f.detail}</p>{f.pageNumber && <p className="mt-1 text-xs text-slate-500">Page {f.pageNumber} of the original record</p>}</li>)}</ul>
        </section>
      )}
      <p className="mt-10 text-xs text-slate-500">Summaries are prepared with the help of AI from public records and reviewed by T County Connect. The original record is the official version.</p>
    </div>
  );
}

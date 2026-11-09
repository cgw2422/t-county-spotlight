import { notFound } from "next/navigation";
import Link from "next/link";
import { BarChart3, ExternalLink, Eye, RotateCcw, Star, Trash2 } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateTime, toDateInput } from "@/lib/utils";
import { pulseHref } from "@/lib/pulse";
import { PageHeader, Card, Notice } from "@/components/admin/page-header";
import { ActionButton, ConfirmButton } from "@/components/admin/action-button";
import { PulseForm } from "../pulse-form";
import { ResultsEditor } from "../results-editor";
import { deletePulse, featurePulse, restorePulse } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit Community Pulse entry" };

const ORG_KIND: Record<string, string> = { CHURCH: "Church", COMMUNITY_GROUP: "Community group" };

export default async function EditPulsePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const user = await requireStaff();
  const isAdmin = user.role === "ADMIN";
  const { id } = await params;
  const { created } = await searchParams;
  const p = await db.communityPulse.findUnique({
    where: { id },
    include: {
      results: {
        orderBy: { sortOrder: "asc" },
        include: { business: { select: { id: true, name: true, city: true } }, organization: { select: { id: true, name: true, city: true, kind: true } } },
      },
    },
  });
  if (!p) notFound();
  const categories = await db.pulseCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } });
  const isPublic = (p.status === "PUBLISHED" || p.status === "ARCHIVED") && !p.deletedAt;

  return (
    <>
      <PageHeader
        title={p.title}
        back={{ href: "/admin/community-pulse/", label: "Community Pulse" }}
        actions={
          <>
            <Link href="/admin/community-pulse/analytics/" className="btn-ghost btn-sm"><BarChart3 className="h-4 w-4" /> Analytics</Link>
            {isPublic ? <a href={pulseHref(p)} target="_blank" rel="noreferrer" className="btn-secondary btn-sm"><ExternalLink className="h-4 w-4" /> View live</a>
              : <Link href={`/admin/community-pulse/${p.id}/preview/`} target="_blank" className="btn-secondary btn-sm"><Eye className="h-4 w-4" /> Preview</Link>}
          </>
        }
      />
      {created && <div className="mb-4"><Notice tone="success">Entry created as a draft. Add the results below, then publish.</Notice></div>}
      {!isAdmin && <div className="mb-4"><Notice tone="info">Only administrators can edit, publish or delete Community Pulse entries.</Notice></div>}

      {p.deletedAt ? (
        <Notice tone="warn" title="This entry was deleted">
          {isAdmin && <div className="mt-2"><ActionButton action={restorePulse} fields={{ id: p.id }} reloadOnSuccess className="btn-secondary btn-sm"><RotateCcw className="h-4 w-4" /> Restore as draft</ActionButton></div>}
        </Notice>
      ) : isAdmin ? (
        <>
          <PulseForm
            key={p.id}
            categories={categories}
            pulse={{
              id: p.id, title: p.title, slug: p.slug, status: p.status, description: p.description ?? "", intro: p.intro ?? "",
              featuredImageUrl: p.featuredImageUrl ?? "", featuredImageAlt: p.featuredImageAlt ?? "", categoryId: p.categoryId ?? "",
              sourceType: p.sourceType, sourceUrl: p.sourceUrl ?? "", sourceLabel: p.sourceLabel ?? "", methodology: p.methodology ?? "",
              discussionDate: toDateInput(p.discussionDate).slice(0, 10), publishedAt: toDateInput(p.publishedAt),
              displayMode: p.displayMode, sortMode: p.sortMode, homepageLimit: p.homepageLimit,
              seoTitle: p.seoTitle ?? "", seoDescription: p.seoDescription ?? "", ogImageUrl: p.ogImageUrl ?? "", wasPublished: !!p.firstPublishedAt,
            }}
          />
          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <Card title="Results" description="Add, reorder and save results separately — you can update them after publishing without touching the fields above." id="results">
              <ResultsEditor
                key={p.resultsChangedAt?.getTime() ?? 0}
                pulseId={p.id}
                displayMode={p.displayMode}
                resultsUpdatedAt={toDateInput(p.resultsUpdatedAt).slice(0, 10)}
                initial={p.results.map((r) => ({
                  id: r.id, name: r.name, mentions: r.mentions, description: r.description ?? "", imageUrl: r.imageUrl ?? "", websiteUrl: r.websiteUrl ?? "",
                  business: r.business ? { id: r.business.id, label: r.business.name, sub: r.business.city } : null,
                  organization: r.organization ? { id: r.organization.id, label: r.organization.name, sub: [ORG_KIND[r.organization.kind] ?? "Nonprofit", r.organization.city].filter(Boolean).join(" · ") } : null,
                }))}
              />
            </Card>
            <div className="space-y-6">
              <Card title="Homepage feature">
                {p.isFeatured ? (
                  <>
                    <p className="mb-3 flex items-center gap-2 text-sm font-medium text-amber-800"><Star className="h-4 w-4 fill-amber-400 text-amber-500" /> Featured in the homepage hero.</p>
                    <ActionButton action={featurePulse} fields={{ id: p.id, on: "0" }} reloadOnSuccess className="btn-secondary btn-sm">Remove from homepage</ActionButton>
                  </>
                ) : p.status === "PUBLISHED" ? (
                  <>
                    <p className="mb-3 text-sm text-slate-600">Only one entry is featured at a time. Featuring this one replaces the current feature.</p>
                    <ActionButton action={featurePulse} fields={{ id: p.id }} reloadOnSuccess className="btn-primary btn-sm"><Star className="h-4 w-4" /> Set as featured</ActionButton>
                  </>
                ) : <p className="text-sm text-slate-600">Publish this entry to feature it on the homepage.</p>}
              </Card>
              <Card title="Internal timestamps" description="System-managed — not editable">
                <dl className="space-y-1.5 text-sm">
                  {[
                    ["Created", p.createdAt],
                    ["First published", p.firstPublishedAt],
                    ["Results last changed", p.resultsChangedAt],
                    ["Last saved", p.updatedAt],
                  ].map(([label, d]) => (
                    <div key={label as string} className="flex justify-between gap-3"><dt className="text-slate-500">{label as string}</dt><dd className="text-right text-slate-800">{d ? formatDateTime(d as Date) : "—"}</dd></div>
                  ))}
                </dl>
              </Card>
              <Card title="Danger zone">
                <p className="mb-3 text-sm text-slate-600">{p.status === "DRAFT" && !p.firstPublishedAt ? "This draft has never been published and will be permanently deleted." : "The entry is removed from the site and can be restored later."}</p>
                <ConfirmButton action={deletePulse} fields={{ id: p.id, redirect: "1" }} title="Delete this entry?" body={<>“{p.title}” will be removed.</>} confirmLabel="Delete">
                  <Trash2 className="h-4 w-4" /> Delete entry
                </ConfirmButton>
              </Card>
            </div>
          </div>
        </>
      ) : (
        <Card title="Summary">
          <p className="text-sm text-slate-700">Status: {p.status.toLowerCase()} · {p.results.length} results</p>
        </Card>
      )}
    </>
  );
}

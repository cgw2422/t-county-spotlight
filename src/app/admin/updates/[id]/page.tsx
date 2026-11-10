import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, ExternalLink, X } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/utils";
import { Card, Notice, PageHeader } from "@/components/admin/page-header";
import { ActionButton } from "@/components/admin/action-button";
import { StatusBadge } from "@/components/admin/status-badge";
import { OPENING_LABELS, isOpeningKind, openingHref } from "@/lib/openings-shared";
import { moderateUpdate } from "../actions";
import { OpeningForm } from "../opening-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit update" };

export default async function EditUpdatePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireStaff();
  const { id } = await params;
  const sp = await searchParams;
  const u = await db.businessUpdate.findUnique({ where: { id }, include: { business: { select: { id: true, name: true, city: true, status: true } } } });
  if (!u) notFound();
  const [submitter, reviewer, suggestion] = await Promise.all([
    u.submittedById ? db.user.findUnique({ where: { id: u.submittedById }, select: { name: true, email: true } }) : null,
    u.reviewedById ? db.user.findUnique({ where: { id: u.reviewedById }, select: { name: true, email: true } }) : null,
    db.communitySuggestion.findFirst({ where: { resultRef: `BusinessUpdate:${u.id}` }, select: { id: true, title: true, eventDate: true } }),
  ]);
  const opening = isOpeningKind(u.kind);
  return (
    <>
      <PageHeader
        title={u.business?.name ?? u.businessName ?? u.title}
        eyebrow={<div className="flex flex-wrap gap-1.5"><StatusBadge status={u.status} />{opening && <span className="badge-blue">{OPENING_LABELS[u.kind as keyof typeof OPENING_LABELS]}</span>}</div>}
        back={{ href: opening ? "/admin/updates/?tab=openings" : "/admin/updates/", label: opening ? "New & Coming Soon" : "Business updates" }}
        actions={
          <>
            {u.status === "PUBLISHED" && opening && <a href={openingHref(u)} target="_blank" rel="noreferrer" className="btn-secondary btn-sm"><ExternalLink className="h-4 w-4" /> View</a>}
            {u.status === "PENDING" && (
              <>
                <ActionButton action={moderateUpdate} fields={{ id: u.id, decision: "approve" }} className="btn-primary btn-sm" reloadOnSuccess><Check className="h-4 w-4" /> Approve</ActionButton>
                <ActionButton action={moderateUpdate} fields={{ id: u.id, decision: "reject" }} prompt={{ name: "reason", label: "Reason (emailed to the owner)", required: true }} confirm={{ title: "Reject this update?", confirmLabel: "Reject", danger: true }} reloadOnSuccess><X className="h-4 w-4" /> Reject</ActionButton>
              </>
            )}
          </>
        }
      />
      {sp.created && <div className="mb-4"><Notice tone="success">Created. Review the details and set the status to Published when it&apos;s ready.</Notice></div>}
      {u.rejectionReason && u.status === "ARCHIVED" && <div className="mb-4"><Notice tone="danger" title="Rejected">{u.rejectionReason}</Notice></div>}
      {suggestion && <div className="mb-4"><Notice tone="info">Created from a resident suggestion: <Link href={`/admin/suggestions/${suggestion.id}/`} className="font-semibold underline">{suggestion.title}</Link>. The submitter is emailed when this is published.{suggestion.eventDate && <> The resident reported an opening date of {formatDate(suggestion.eventDate)} — it was not copied; enter it only once it&apos;s officially announced.</>}</Notice></div>}
      <OpeningForm v={{
        id: u.id, kind: u.kind, status: u.status === "SUSPENDED" ? "ARCHIVED" : u.status,
        business: u.business ? { id: u.business.id, label: u.business.name, sub: u.business.city } : null,
        businessName: u.businessName, address: u.address, city: u.city, title: u.title, body: u.body,
        photos: u.photos.length ? u.photos : u.imageUrl ? [u.imageUrl] : [],
        effectiveDate: u.effectiveDate, dateNote: u.dateNote, linkUrl: u.linkUrl, featuredUntil: u.featuredUntil,
      }} />
      <div className="mt-6 max-w-xl">
        <Card title="History">
          <dl className="space-y-2 text-sm">
            <div><dt className="text-slate-500">Created</dt><dd>{formatDateTime(u.createdAt)}{submitter ? ` by ${submitter.name || submitter.email}` : ""}</dd></div>
            <div><dt className="text-slate-500">Last updated</dt><dd>{formatDateTime(u.updatedAt)}</dd></div>
            {u.reviewedAt && <div><dt className="text-slate-500">Reviewed</dt><dd>{formatDateTime(u.reviewedAt)}{reviewer ? ` by ${reviewer.name || reviewer.email}` : ""}</dd></div>}
            {u.publishedAt && <div><dt className="text-slate-500">First published</dt><dd>{formatDateTime(u.publishedAt)}</dd></div>}
            {u.featuredUntil && <div><dt className="text-slate-500">On the homepage until</dt><dd>{formatDateTime(u.featuredUntil)}</dd></div>}
          </dl>
        </Card>
      </div>
    </>
  );
}

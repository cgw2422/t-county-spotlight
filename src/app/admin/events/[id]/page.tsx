import { notFound } from "next/navigation";
import { Check, X, EyeOff, Archive, ExternalLink, Trash2 } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { describeRecurrence } from "@/lib/events";
import { formatDateTime } from "@/lib/utils";
import { eventHref } from "@/lib/links";
import { PageHeader, Notice } from "@/components/admin/page-header";
import { ActionButton, ConfirmButton } from "@/components/admin/action-button";
import { StatusBadge } from "@/components/admin/status-badge";
import { EventForm } from "../event-form";
import { setEventStatus, trashEvent } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit event" };

export default async function EditEventPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  await requireStaff();
  const { id } = await params;
  const { created } = await searchParams;
  const e = await db.event.findUnique({ where: { id }, include: { business: { select: { id: true, name: true, city: true } }, submittedBy: { select: { email: true, name: true } } } });
  if (!e || e.deletedAt) notFound();
  const categories = await db.eventCategory.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } });
  const rec = describeRecurrence(e.recurrence);
  return (
    <>
      <PageHeader
        title={e.title}
        back={{ href: "/admin/events/", label: "Events" }}
        eyebrow={<div className="flex flex-wrap gap-1.5"><StatusBadge status={e.status} />{e.isSponsored && <span className="badge-sponsored">Sponsored</span>}{e.isFeatured && <span className="badge-blue">Featured</span>}</div>}
        description={<>{formatDateTime(e.startAt)}{rec ? ` · ${rec}` : ""}</>}
        actions={
          <>
            {e.status === "PUBLISHED" && <a href={eventHref(e)} target="_blank" rel="noreferrer" className="btn-secondary btn-sm"><ExternalLink className="h-4 w-4" /> View</a>}
            {e.status === "PENDING" && (
              <>
                <ActionButton action={setEventStatus} fields={{ id: e.id, status: "PUBLISHED" }} className="btn-primary btn-sm"><Check className="h-4 w-4" /> Approve</ActionButton>
                <ActionButton action={setEventStatus} fields={{ id: e.id, status: "REJECTED" }} prompt={{ name: "reason", label: "Reason (emailed to the submitter)", required: true }} confirm={{ title: "Reject this event?", confirmLabel: "Reject", danger: true }}><X className="h-4 w-4" /> Reject</ActionButton>
              </>
            )}
            {e.status === "PUBLISHED" && <ActionButton action={setEventStatus} fields={{ id: e.id, status: "UNPUBLISHED" }}><EyeOff className="h-4 w-4" /> Unpublish</ActionButton>}
            {e.status !== "ARCHIVED" && <ActionButton action={setEventStatus} fields={{ id: e.id, status: "ARCHIVED" }} confirm={{ title: "Archive this event?", body: "It will be hidden from the calendar.", confirmLabel: "Archive" }}><Archive className="h-4 w-4" /> Archive</ActionButton>}
          </>
        }
      />
      {created && <div className="mb-4"><Notice tone="success">Event created.</Notice></div>}
      {(e.submitterEmail || (e.submittedBy && e.status === "PENDING")) && (
        <div className="mb-4"><Notice title="Community submission">Submitted by {e.submittedBy?.name || e.submitterEmail || e.submittedBy?.email} on {formatDateTime(e.createdAt)}. Approving or rejecting emails the submitter.</Notice></div>
      )}
      {e.status === "REJECTED" && e.rejectionReason && <div className="mb-4"><Notice tone="danger" title="Rejected">{e.rejectionReason}</Notice></div>}
      <EventForm e={e} categories={categories} business={e.business ? { id: e.business.id, label: e.business.name, sub: e.business.city } : null} />
      <div className="mt-8 flex justify-end">
        <ConfirmButton action={trashEvent} fields={{ id: e.id }} title="Delete this event?" body="It will be removed from the calendar and admin lists (soft delete, recoverable from the database)." confirmLabel="Delete event"><Trash2 className="h-4 w-4" /> Delete event</ConfirmButton>
      </div>
    </>
  );
}

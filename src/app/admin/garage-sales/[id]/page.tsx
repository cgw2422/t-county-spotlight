import { notFound } from "next/navigation";
import { Check, ExternalLink, RotateCcw, Trash2, X } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import { nyDateKey } from "@/components/public/dates";
import { Card, Notice, PageHeader } from "@/components/admin/page-header";
import { ActionButton } from "@/components/admin/action-button";
import { ActionForm, Submit } from "@/components/admin/action-form";
import { Checkbox, FormGrid, SelectField, TextArea, TextField } from "@/components/admin/form-field";
import { StatusBadge } from "@/components/admin/status-badge";
import { garageSaleHref, isSaleEnded } from "@/lib/garage-sales";
import { GARAGE_SALE_CATEGORIES, GARAGE_SALE_TYPES, directionsUrl, formatHours, formatSaleDates, saleTypeLabel } from "@/lib/garage-sales-shared";
import { adminSaveGarageSale, setGarageSaleStatus } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Garage sale" };

export default async function AdminGarageSalePage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  const s = await db.garageSale.findUnique({ where: { id } });
  if (!s) notFound();
  const [owner, reviewer] = await Promise.all([
    s.userId ? db.user.findUnique({ where: { id: s.userId }, select: { email: true, name: true } }) : null,
    s.reviewedById ? db.user.findUnique({ where: { id: s.reviewedById }, select: { email: true, name: true } }) : null,
  ]);
  const ended = s.status === "PUBLISHED" && isSaleEnded(s);
  const cats = new Set(s.itemCategories);
  return (
    <>
      <PageHeader
        title={s.title}
        back={{ href: "/admin/garage-sales/", label: "Garage sales" }}
        eyebrow={<div className="flex flex-wrap gap-1.5"><StatusBadge status={s.status} />{ended && <StatusBadge status="Expired" label="Ended" />}</div>}
        description={<>{saleTypeLabel(s.saleType)} · {formatSaleDates(s.startDate, s.endDate)} · {formatHours(s.dailyStart, s.dailyEnd)}</>}
        actions={
          <>
            {s.status === "PUBLISHED" && !ended && <a href={garageSaleHref(s)} target="_blank" rel="noreferrer" className="btn-secondary btn-sm"><ExternalLink className="h-4 w-4" /> View</a>}
            {s.status === "PENDING" && (
              <>
                <ActionButton action={setGarageSaleStatus} fields={{ id: s.id, status: "PUBLISHED" }} className="btn-primary btn-sm"><Check className="h-4 w-4" /> Approve</ActionButton>
                <ActionButton action={setGarageSaleStatus} fields={{ id: s.id, status: "REJECTED" }} prompt={{ name: "reason", label: "Reason (emailed to the submitter)", required: true }} confirm={{ title: "Reject this sale?", confirmLabel: "Reject", danger: true }}><X className="h-4 w-4" /> Reject</ActionButton>
              </>
            )}
            {(s.status === "REJECTED" || s.status === "REMOVED") && <ActionButton action={setGarageSaleStatus} fields={{ id: s.id, status: "PENDING" }}><RotateCcw className="h-4 w-4" /> Move to pending</ActionButton>}
            {s.status !== "REMOVED" && <ActionButton action={setGarageSaleStatus} fields={{ id: s.id, status: "REMOVED" }} confirm={{ title: "Remove this sale?", body: "It will no longer be listed publicly.", confirmLabel: "Remove", danger: true }}><Trash2 className="h-4 w-4" /> Remove</ActionButton>}
          </>
        }
      />
      {s.status === "REJECTED" && s.rejectionReason && <div className="mb-4"><Notice tone="danger" title="Rejected">{s.rejectionReason}</Notice></div>}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <ActionForm action={adminSaveGarageSale} warnUnsaved className="min-w-0 space-y-6">
          <input type="hidden" name="id" value={s.id} />
          <Card title="Sale">
            <div className="space-y-4">
              <TextField name="title" label="Title" required maxLength={120} defaultValue={s.title} />
              <SelectField name="saleType" label="Kind of sale" defaultValue={s.saleType} options={GARAGE_SALE_TYPES.map((t) => ({ value: t.value, label: t.label }))} />
              <TextArea name="description" label="Description" rows={4} maxLength={2000} defaultValue={s.description ?? ""} />
              <fieldset>
                <legend className="label">Items</legend>
                <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
                  {GARAGE_SALE_CATEGORIES.map((c) => <Checkbox key={c.key} name="itemCategories" value={c.key} label={c.label} defaultChecked={cats.has(c.key)} />)}
                </div>
              </fieldset>
            </div>
          </Card>
          <Card title="Dates & hours" description="Eastern Time.">
            <FormGrid>
              <TextField name="startDate" type="date" label="First day" required defaultValue={nyDateKey(s.startDate)} />
              <TextField name="endDate" type="date" label="Last day" required defaultValue={nyDateKey(s.endDate)} />
              <TextField name="dailyStart" type="time" label="Opens" required defaultValue={s.dailyStart} />
              <TextField name="dailyEnd" type="time" label="Closes" required defaultValue={s.dailyEnd} />
            </FormGrid>
          </Card>
          <Card title="Location" description="The street address is private unless “Show exact address” is selected.">
            <FormGrid>
              <TextField name="address" label="Street address (private)" defaultValue={s.address ?? ""} />
              <TextField name="generalLocation" label="General location (public)" defaultValue={s.generalLocation ?? ""} />
              <TextField name="city" label="Town" defaultValue={s.city ?? ""} />
              <TextField name="zip" label="ZIP" defaultValue={s.zip ?? ""} />
              <SelectField name="addressVisibility" label="Public location" defaultValue={s.addressVisibility} options={[{ value: "GENERAL", label: "General location only" }, { value: "EXACT", label: "Show exact address" }]} />
            </FormGrid>
          </Card>
          {s.photos.length > 0 && (
            <Card title="Photos" description="Untick a photo to remove it from the listing.">
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {s.photos.map((p, i) => (
                  <li key={p} className="space-y-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p} alt={`Photo ${i + 1}`} className="aspect-square w-full rounded-lg object-cover" />
                    <Checkbox name="photos" value={p} defaultChecked label="Keep" />
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <div className="flex justify-end"><Submit>Save changes</Submit></div>
        </ActionForm>
        <aside className="space-y-4">
          <Card title="Submitter (private)">
            <dl className="space-y-2 text-sm">
              <div><dt className="text-slate-500">Name</dt><dd className="font-medium text-slate-900">{s.submitterName || "—"}</dd></div>
              <div><dt className="text-slate-500">Email</dt><dd className="break-all font-medium text-slate-900"><a href={`mailto:${s.submitterEmail}`} className="text-brand-700 hover:underline">{s.submitterEmail}</a></dd></div>
              <div><dt className="text-slate-500">Account</dt><dd className="text-slate-900">{owner ? `${owner.name || owner.email}` : "Submitted without an account"}</dd></div>
              <div><dt className="text-slate-500">Street address</dt><dd className="text-slate-900">{[s.address, s.city, s.zip].filter(Boolean).join(", ") || "—"}</dd></div>
              <div><dt className="text-slate-500">Shown publicly</dt><dd className="text-slate-900">{s.addressVisibility === "EXACT" ? "Exact address" : `General: ${s.generalLocation || "—"}`}</dd></div>
              <div><dt className="text-slate-500">Public directions</dt><dd><a href={directionsUrl(s)} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">Open in Google Maps</a></dd></div>
            </dl>
          </Card>
          <Card title="History">
            <dl className="space-y-2 text-sm">
              <div><dt className="text-slate-500">Submitted</dt><dd>{formatDateTime(s.createdAt)}</dd></div>
              <div><dt className="text-slate-500">Last updated</dt><dd>{formatDateTime(s.updatedAt)}</dd></div>
              {s.reviewedAt && <div><dt className="text-slate-500">Reviewed</dt><dd>{formatDateTime(s.reviewedAt)}{reviewer ? ` by ${reviewer.name || reviewer.email}` : ""}</dd></div>}
              {s.publishedAt && <div><dt className="text-slate-500">First published</dt><dd>{formatDateTime(s.publishedAt)}</dd></div>}
              {s.removedAt && <div><dt className="text-slate-500">Removed</dt><dd>{formatDateTime(s.removedAt)}</dd></div>}
            </dl>
          </Card>
        </aside>
      </div>
    </>
  );
}

import { notFound } from "next/navigation";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import { PageHeader, Card, Notice } from "@/components/admin/page-header";
import { ActionForm, Submit } from "@/components/admin/action-form";
import { ActionButton } from "@/components/admin/action-button";
import { Checkbox, SelectField, TextArea } from "@/components/admin/form-field";
import { StatusBadge } from "@/components/admin/status-badge";
import { approveApplication, rejectApplication } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Review application" };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 py-2.5 sm:grid-cols-[160px_1fr] sm:gap-4">
      <dt className="text-sm font-medium text-slate-500">{label}</dt>
      <dd className="min-w-0 break-words text-sm text-slate-900">{children || <span className="text-slate-400">—</span>}</dd>
    </div>
  );
}

export default async function ApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  const app = await db.businessApplication.findUnique({ where: { id }, include: { user: { select: { email: true, name: true } }, business: { select: { id: true, name: true } } } });
  if (!app) notFound();
  const [categories, existingUser, similar] = await Promise.all([
    db.businessCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
    db.user.findUnique({ where: { email: app.email.toLowerCase() }, select: { id: true, role: true } }),
    db.business.findMany({ where: { name: { contains: app.businessName.split(/\s+/)[0], mode: "insensitive" }, deletedAt: null }, take: 5, select: { id: true, name: true, city: true } }),
  ]);
  const guess = categories.find((c) => app.category && c.name.toLowerCase().includes(app.category.toLowerCase().split(/[ &,]/)[0]));
  const extra = app.data && typeof app.data === "object" ? Object.entries(app.data as Record<string, unknown>).filter(([, v]) => v !== null && v !== "" && typeof v !== "object") : [];

  return (
    <>
      <PageHeader title={app.businessName} back={{ href: "/admin/applications/", label: "Applications" }} eyebrow={<StatusBadge status={app.status} />} description={`Submitted ${formatDateTime(app.createdAt)}`} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Card title="Application details">
            <dl className="divide-y divide-slate-100">
              <Row label="Business">{app.businessName}</Row>
              <Row label="Contact">{app.contactName}</Row>
              <Row label="Email"><a className="text-brand-700 hover:underline" href={`mailto:${app.email}`}>{app.email}</a></Row>
              <Row label="Phone">{app.phone}</Row>
              <Row label="Website">{app.website && <a className="text-brand-700 hover:underline" href={/^https?:/.test(app.website) ? app.website : `https://${app.website}`} target="_blank" rel="noreferrer nofollow">{app.website}</a>}</Row>
              <Row label="Address">{[app.address, app.city].filter(Boolean).join(", ")}</Row>
              <Row label="Category">{app.category}</Row>
              <Row label="Wants spotlight">{app.wantsSpotlight ? "Yes — interested in an editorial spotlight" : "No"}</Row>
              <Row label="Message">{app.message && <p className="whitespace-pre-wrap">{app.message}</p>}</Row>
              {extra.map(([k, v]) => <Row key={k} label={k}>{String(v)}</Row>)}
              {app.user && <Row label="Submitted by">{app.user.name || app.user.email} (signed in)</Row>}
            </dl>
          </Card>
          {similar.length > 0 && (
            <Notice tone="warn" title="Possible duplicates">
              <ul className="mt-1 list-disc pl-5">{similar.map((s) => <li key={s.id}><Link className="underline" href={`/admin/businesses/${s.id}/`}>{s.name}</Link>{s.city ? ` — ${s.city}` : ""}</li>)}</ul>
            </Notice>
          )}
        </div>
        <div className="space-y-6">
          {app.status === "PENDING" ? (
            <>
              <Card title="Approve">
                <ActionForm action={approveApplication} className="space-y-3">
                  <input type="hidden" name="id" value={app.id} />
                  <SelectField name="status" label="Create listing as" options={[{ value: "DRAFT", label: "Draft (review before publishing)" }, { value: "PUBLISHED", label: "Published immediately" }]} />
                  <fieldset>
                    <legend className="label">Categories</legend>
                    <div className="max-h-44 overflow-y-auto rounded-lg border border-slate-200 p-2">
                      {categories.map((c) => (
                        <label key={c.id} className="flex min-h-9 items-center gap-2 text-sm"><input type="checkbox" name="categories" value={c.id} defaultChecked={guess?.id === c.id} className="h-4 w-4 accent-brand-600" />{c.name}</label>
                      ))}
                    </div>
                  </fieldset>
                  <Checkbox name="linkOwner" defaultChecked label={`Link ${app.email} as owner`} help={existingUser ? `Existing ${existingUser.role.toLowerCase().replace("_", " ")} account will be linked.` : "A Business Owner account will be created with no password; they set one via “Forgot password”."} />
                  <Checkbox name="notify" defaultChecked label="Email the applicant" />
                  <TextArea name="note" label="Note to applicant (optional)" rows={2} />
                  <Submit pendingText="Approving…" className="btn-primary w-full"><CheckCircle2 className="h-4 w-4" /> Approve & create listing</Submit>
                </ActionForm>
              </Card>
              <Card title="Reject">
                <p className="mb-3 text-sm text-slate-600">The applicant is emailed the reason you give.</p>
                <ActionButton action={rejectApplication} fields={{ id: app.id }} className="btn-secondary w-full text-red-700" prompt={{ name: "note", label: "Reason for rejection", required: true, placeholder: "e.g. This business is outside Tuscarawas County." }} confirm={{ title: "Reject this application?", confirmLabel: "Reject & notify", danger: true }}>
                  Reject application
                </ActionButton>
              </Card>
            </>
          ) : (
            <Card title="Review">
              <p className="text-sm text-slate-700"><StatusBadge status={app.status} /> {app.reviewedAt && `on ${formatDateTime(app.reviewedAt)}`}</p>
              {app.reviewNote && <p className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{app.reviewNote}</p>}
              {app.business && <Link href={`/admin/businesses/${app.business.id}/`} className="btn-secondary btn-sm mt-3">Open {app.business.name}</Link>}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

import { Megaphone, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { formatDate, stripHtml } from "@/lib/utils";
import { requireOrgAccess } from "@/lib/gives/access";
import { PageHeader, Panel } from "@/components/dashboard/shell";
import { OrgUpdateForm } from "@/components/gives/dashboard-forms";
import { ConfirmButton } from "@/components/admin/action-button";
import { deleteOrgUpdateAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Updates" };

export default async function OrgUpdatesPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const { org } = await requireOrgAccess(orgId);
  const updates = await db.organizationUpdate.findMany({ where: { organizationId: org.id }, orderBy: { createdAt: "desc" }, take: 50 });
  return (
    <>
      <PageHeader title="Updates" description="Share news, say thank you, or celebrate a milestone. Updates show on your public page." />
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Panel title="Post an update"><OrgUpdateForm orgId={org.id} /></Panel>
        <section aria-labelledby="past-updates">
          <h2 id="past-updates" className="mb-3 text-lg font-semibold text-navy-900">Your updates</h2>
          {updates.length === 0 ? (
            <p className="flex items-center gap-2 rounded-xl bg-white p-5 text-sm text-slate-500 ring-1 ring-slate-200"><Megaphone className="h-4 w-4" aria-hidden /> Nothing posted yet.</p>
          ) : (
            <ul className="space-y-3">
              {updates.map((u) => (
                <li key={u.id} className="card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{formatDate(u.createdAt)}{u.status === "DRAFT" && <span className="badge-gray ml-2 normal-case">Draft</span>}</p>
                      <p className="mt-0.5 font-semibold text-navy-900">{u.title}</p>
                      <p className="mt-1 line-clamp-3 text-sm text-slate-600">{stripHtml(u.body)}</p>
                    </div>
                    <ConfirmButton action={deleteOrgUpdateAction} fields={{ orgId: org.id, updateId: u.id }} title="Delete this update?" confirmLabel="Delete"><Trash2 className="h-4 w-4" aria-label="Delete" /></ConfirmButton>
                  </div>
                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm font-medium text-brand-700">Edit</summary>
                    <div className="mt-3"><OrgUpdateForm orgId={org.id} update={{ id: u.id, title: u.title, body: u.body, imageUrl: u.imageUrl, status: u.status }} /></div>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

import type { Metadata } from "next";
import { Megaphone, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { requireBusinessAccess } from "@/lib/auth";
import { getBusinessEntitlements } from "@/lib/entitlements";
import { getSettings } from "@/lib/settings";
import { formatDate } from "@/lib/utils";
import { PageHeader, Panel, StatusBadge, Upsell } from "@/components/dashboard/shell";
import { UpdateForm } from "@/components/dashboard/update-form";
import { EmptyState } from "@/components/ui/empty-state";
import { deleteUpdateAction } from "../actions";

export const metadata: Metadata = { title: "Updates" };
export const dynamic = "force-dynamic";

export default async function UpdatesPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const { business } = await requireBusinessAccess(businessId);
  const { entitlements } = await getBusinessEntitlements(business.id);
  if (!entitlements.updates) return <><PageHeader title="Updates" /><Upsell businessId={business.id} feature="Business updates" /></>;
  const [updates, settings, followers] = await Promise.all([
    db.businessUpdate.findMany({ where: { businessId: business.id }, orderBy: { createdAt: "desc" }, take: 50 }),
    getSettings(),
    db.businessFollow.count({ where: { businessId: business.id } }),
  ]);
  return (
    <>
      <PageHeader title="Updates" description={<>Share news like new menu items, holiday hours or a new hire. Updates appear on your listing{followers ? ` and reach your ${followers} follower${followers === 1 ? "" : "s"}` : ""}.</>} />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div>
          {updates.length === 0 ? (
            <EmptyState icon={Megaphone} title="No updates yet">Post your first update to let people know what&apos;s new.</EmptyState>
          ) : (
            <ul className="space-y-3">
              {updates.map((u) => (
                <li key={u.id} className="card p-4">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-navy-900">{u.title}</p>
                      <p className="text-xs text-slate-500">{formatDate(u.createdAt)}</p>
                    </div>
                    <StatusBadge status={u.status} />
                  </div>
                  <p className="mt-2 whitespace-pre-line text-sm text-slate-700">{u.body}</p>
                  <form action={deleteUpdateAction} className="mt-2 text-right">
                    <input type="hidden" name="businessId" value={business.id} />
                    <input type="hidden" name="updateId" value={u.id} />
                    <button className="btn-ghost btn-sm text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" aria-hidden /> Delete</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </div>
        <Panel title="Post an update" description={settings.requireUpdateApproval ? "Our team gives updates a quick look before they go live." : undefined}>
          <UpdateForm businessId={business.id} />
        </Panel>
      </div>
    </>
  );
}

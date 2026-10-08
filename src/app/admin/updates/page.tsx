import Link from "next/link";
import { Megaphone, Check, X, EyeOff, Trash2 } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { sanitizeRichText } from "@/lib/sanitize";
import { formatDateTime } from "@/lib/utils";
import { PageHeader } from "@/components/admin/page-header";
import { LinkTabs } from "@/components/admin/tabs";
import { Pagination } from "@/components/admin/data-table";
import { StatusBadge } from "@/components/admin/status-badge";
import { ActionButton, ConfirmButton } from "@/components/admin/action-button";
import { EmptyState } from "@/components/ui/empty-state";
import { pageParams, spGet, type SP } from "../_lib/list";
import { moderateUpdate } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Business updates" };

const TABS: { key: string; label: string; status: Prisma.EnumPublishStatusFilter<"BusinessUpdate"> }[] = [
  { key: "pending", label: "Pending", status: { equals: "PENDING" } },
  { key: "published", label: "Published", status: { equals: "PUBLISHED" } },
  { key: "rejected", label: "Rejected / hidden", status: { in: ["ARCHIVED", "DRAFT", "SUSPENDED"] } },
];

export default async function UpdatesPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireStaff();
  const sp = await searchParams;
  const tab = TABS.find((t) => t.key === spGet(sp, "tab")) ?? TABS[0];
  const { page, take, skip, perPage } = pageParams(sp, 20);
  const [rows, total, counts] = await Promise.all([
    db.businessUpdate.findMany({ where: { status: tab.status }, skip, take, orderBy: { createdAt: tab.key === "pending" ? "asc" : "desc" }, include: { business: { select: { id: true, name: true } } } }),
    db.businessUpdate.count({ where: { status: tab.status } }),
    Promise.all(TABS.map((t) => db.businessUpdate.count({ where: { status: t.status } }))),
  ]);
  return (
    <>
      <PageHeader title="Business updates" description="News posts from business owners (new hours, menu changes, announcements). Members' plans include posting updates." />
      <LinkTabs items={TABS.map((t, i) => ({ label: t.label, href: `/admin/updates/?tab=${t.key}`, active: t.key === tab.key, count: counts[i] }))} />
      {rows.length ? (
        <div className="space-y-4">
          {rows.map((u) => (
            <article key={u.id} className="card overflow-hidden">
              <div className="flex flex-col gap-4 p-4 sm:flex-row sm:p-5">
                {u.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={u.imageUrl} alt="" className="h-40 w-full shrink-0 rounded-xl object-cover sm:h-28 sm:w-40" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <StatusBadge status={u.status} />
                    <Link href={`/admin/businesses/${u.business.id}/`} className="font-semibold text-brand-700 hover:underline">{u.business.name}</Link>
                    <span>{formatDateTime(u.createdAt)}</span>
                  </div>
                  <h2 className="mt-1.5 text-base font-semibold text-slate-900">{u.title}</h2>
                  <div className="prose prose-sm prose-slate mt-1 max-w-none text-slate-700" dangerouslySetInnerHTML={{ __html: sanitizeRichText(u.body.includes("<") ? u.body : u.body.replace(/\n/g, "<br>")) }} />
                </div>
              </div>
              <div className="flex flex-wrap gap-2 border-t border-slate-100 bg-slate-50/60 px-4 py-3 sm:px-5">
                {u.status !== "PUBLISHED" && <ActionButton action={moderateUpdate} fields={{ id: u.id, decision: "approve" }} className="btn-primary btn-sm"><Check className="h-4 w-4" /> Approve</ActionButton>}
                {u.status === "PENDING" && <ActionButton action={moderateUpdate} fields={{ id: u.id, decision: "reject" }} prompt={{ name: "reason", label: "Reason (optional, emailed to the owner)" }} confirm={{ title: "Reject this update?", confirmLabel: "Reject", danger: true }}><X className="h-4 w-4" /> Reject</ActionButton>}
                {u.status === "PUBLISHED" && <ActionButton action={moderateUpdate} fields={{ id: u.id, decision: "unpublish" }}><EyeOff className="h-4 w-4" /> Unpublish</ActionButton>}
                <ConfirmButton action={moderateUpdate} fields={{ id: u.id, decision: "delete" }} title="Delete this update?" body="This permanently removes the post." className="btn-ghost btn-sm text-red-700"><Trash2 className="h-4 w-4" /> Delete</ConfirmButton>
              </div>
            </article>
          ))}
          <div className="card"><Pagination total={total} page={page} perPage={perPage} basePath="/admin/updates/" params={sp} /></div>
        </div>
      ) : (
        <EmptyState icon={Megaphone} title={tab.key === "pending" ? "Nothing waiting for review" : "No updates here"}>Updates posted by business owners appear here for moderation.</EmptyState>
      )}
    </>
  );
}

import { notFound } from "next/navigation";
import { ExternalLink, RotateCcw, Trash2 } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { pageHref } from "@/lib/links";
import { PageHeader, Notice } from "@/components/admin/page-header";
import { ActionButton, ConfirmButton } from "@/components/admin/action-button";
import { StatusBadge } from "@/components/admin/status-badge";
import { PageForm } from "../page-form";
import { restorePage, trashPage } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit page" };

export default async function EditPagePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  await requireStaff();
  const { id } = await params;
  const { created } = await searchParams;
  const p = await db.page.findUnique({ where: { id } });
  if (!p) notFound();
  return (
    <>
      <PageHeader title={p.title} back={{ href: "/admin/pages/", label: "Pages" }} eyebrow={<StatusBadge status={p.deletedAt ? "Trash" : p.status} />}
        actions={p.status === "PUBLISHED" && !p.deletedAt ? <a href={pageHref(p)} target="_blank" rel="noreferrer" className="btn-secondary btn-sm"><ExternalLink className="h-4 w-4" /> View</a> : undefined} />
      {created && <div className="mb-4"><Notice tone="success">Page created.</Notice></div>}
      {p.deletedAt ? (
        <Notice tone="warn" title="This page is in the trash"><div className="mt-2"><ActionButton action={restorePage} fields={{ id: p.id }} reloadOnSuccess><RotateCcw className="h-4 w-4" /> Restore page</ActionButton></div></Notice>
      ) : (
        <>
          <PageForm p={p} />
          <div className="mt-8 flex justify-end">
            <ConfirmButton action={trashPage} fields={{ id: p.id, redirect: "1" }} title="Move to trash?" body="The page and its menu links will be hidden." confirmLabel="Move to trash"><Trash2 className="h-4 w-4" /> Move to trash</ConfirmButton>
          </div>
        </>
      )}
    </>
  );
}

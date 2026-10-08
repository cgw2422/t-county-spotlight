import { notFound } from "next/navigation";
import { Trash2 } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader, Notice } from "@/components/admin/page-header";
import { ConfirmButton } from "@/components/admin/action-button";
import { StatusBadge } from "@/components/admin/status-badge";
import { JobForm } from "../job-form";
import { trashJob } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit job" };

export default async function EditJobPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  await requireStaff();
  const { id } = await params;
  const { created } = await searchParams;
  const j = await db.job.findUnique({ where: { id }, include: { business: { select: { id: true, name: true } } } });
  if (!j || j.deletedAt) notFound();
  return (
    <>
      <PageHeader title={j.title} back={{ href: "/admin/jobs/", label: "Jobs" }} eyebrow={<StatusBadge status={j.status} />} />
      {created && <div className="mb-4"><Notice tone="success">Job created.</Notice></div>}
      <JobForm j={j} business={j.business ? { id: j.business.id, label: j.business.name } : null} />
      <div className="mt-8 flex justify-end">
        <ConfirmButton action={trashJob} fields={{ id: j.id }} title="Delete this job?" confirmLabel="Delete job"><Trash2 className="h-4 w-4" /> Delete job</ConfirmButton>
      </div>
    </>
  );
}

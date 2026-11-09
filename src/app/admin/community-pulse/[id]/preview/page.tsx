import { notFound } from "next/navigation";
import Link from "next/link";
import { Pencil } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { getRelatedPulses } from "@/lib/pulse";
import { StatusBadge } from "@/components/admin/status-badge";
import { PulseView, pulseViewInclude } from "@/components/pulse/pulse-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Preview", robots: { index: false, follow: false } };

export default async function PreviewPulse({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  const p = await db.communityPulse.findUnique({ where: { id }, include: pulseViewInclude });
  if (!p) notFound();
  const related = await getRelatedPulses(p);
  const live = p.status === "PUBLISHED" && !p.deletedAt && !!p.publishedAt && p.publishedAt <= new Date();
  return (
    <>
      <div className="sticky top-16 z-30 -mx-4 mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8" role="status">
        <span className="inline-flex flex-wrap items-center gap-2 font-semibold">{live ? "Preview" : "Preview — not published"} <StatusBadge status={p.deletedAt ? "DELETED" : p.status} /></span>
        <Link href={`/admin/community-pulse/${p.id}/`} className="btn-primary btn-sm"><Pencil className="h-4 w-4" /> Back to editor</Link>
      </div>
      <div className="-mx-4 overflow-hidden rounded-2xl bg-white sm:mx-0">
        <PulseView p={p} related={related} preview />
      </div>
    </>
  );
}

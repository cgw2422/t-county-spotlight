import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, LayoutDashboard } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import { SIGNUP_BADGE, SIGNUP_STATUS_LABEL } from "@/lib/gives/constants";
import { PageHeader } from "@/components/admin/page-header";
import { DataTable } from "@/components/admin/data-table";

export const dynamic = "force-dynamic";
export const metadata = { title: "Registrations" };

export default async function AdminOpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  const opp = await db.volunteerOpportunity.findUnique({ where: { id }, include: { organization: { select: { id: true, name: true } }, signups: { orderBy: { createdAt: "asc" } } } });
  if (!opp) notFound();
  return (
    <>
      <PageHeader
        title={opp.title}
        description={<>{opp.organization.name} · {opp.isOngoing ? "Ongoing" : opp.startAt ? formatDateTime(opp.startAt) : "Date TBA"}{opp.spots != null ? ` · ${opp.spots} spots` : ""}</>}
        back={{ href: "/admin/volunteer/", label: "Volunteer opportunities" }}
        actions={<>
          <Link href={`/organization/${opp.organization.id}/volunteer/${opp.id}/`} className="btn-secondary btn-sm"><LayoutDashboard className="h-4 w-4" /> Manage</Link>
          {opp.signups.length > 0 && <a href={`/organization/${opp.organization.id}/volunteer/${opp.id}/export/`} className="btn-secondary btn-sm"><Download className="h-4 w-4" /> CSV</a>}
        </>}
      />
      <p className="mb-3 text-sm text-slate-500">Volunteer contact details are private. Use them only to support this organization.</p>
      <div className="card overflow-hidden">
        <DataTable
          rows={opp.signups}
          rowKey={(r) => r.id}
          empty={<p className="text-sm text-slate-500">No registrations.</p>}
          columns={[
            { header: "Name", primary: true, cell: (r) => <span className="font-medium text-slate-900">{r.name}{!r.isAdult && <span className="badge-amber ml-2">Under 18</span>}</span> },
            { header: "Email", cell: (r) => <a href={`mailto:${r.email}`} className="break-all text-brand-700">{r.email}</a> },
            { header: "Phone", cell: (r) => r.phone || "—" },
            { header: "Status", cell: (r) => <span className={SIGNUP_BADGE[r.status]}>{SIGNUP_STATUS_LABEL[r.status]}</span> },
            { header: "Notes", cell: (r) => <span className="text-slate-600">{r.notes || "—"}</span>, hideOnMobile: true },
            { header: "Signed up", cell: (r) => formatDateTime(r.createdAt), hideOnMobile: true },
          ]}
        />
      </div>
    </>
  );
}

import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/admin/page-header";
import { DataTable, Pagination } from "@/components/admin/data-table";
import { LinkTabs } from "@/components/admin/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateTime } from "@/lib/utils";
import { pageParams, spGet, type SP } from "../../_lib/list";
import { BASE } from "../_lib";

export const dynamic = "force-dynamic";
export const metadata = { title: "Government Watch activity" };

export default async function ActivityPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin();
  const sp = await searchParams;
  const errorsOnly = spGet(sp, "status") === "error";
  const { page, take, skip, perPage } = pageParams(sp, 50);
  const where: Prisma.GovCheckRunWhereInput = errorsOnly ? { status: "error" } : {};
  const [rows, total, errs] = await Promise.all([
    db.govCheckRun.findMany({ where, skip, take, orderBy: { startedAt: "desc" }, include: { source: { select: { id: true, name: true } } } }),
    db.govCheckRun.count({ where }), db.govCheckRun.count({ where: { status: "error" } }),
  ]);
  return (
    <>
      <PageHeader title="Collection activity" back={{ href: `${BASE}/`, label: "Government Watch" }} description="Every website check, Check Now and records-inbox read, with what it found and any errors." />
      <LinkTabs className="mb-3" items={[{ label: "All", href: `${BASE}/activity/`, active: !errorsOnly }, { label: "Errors", href: `${BASE}/activity/?status=error`, active: errorsOnly, count: errs }]} />
      <DataTable rows={rows} rowKey={(r) => r.id} empty={<EmptyState title="Nothing collected yet" />}
        columns={[
          { header: "When", cell: (r) => <span className="text-sm">{formatDateTime(r.startedAt)}</span> },
          { header: "Source", primary: true, cell: (r) => r.source ? <Link className="font-medium text-brand-700 hover:underline" href={`${BASE}/sources/${r.source.id}/`}>{r.source.name}</Link> : <span className="text-sm">Records inbox</span> },
          { header: "Trigger", hideOnMobile: true, cell: (r) => <span className="text-sm">{r.trigger === "cron" ? "Daily check" : r.trigger === "manual" ? "Check now" : "Email"}</span> },
          { header: "Result", cell: (r) => <span className={r.status === "error" ? "badge-red" : r.status === "running" ? "badge-amber" : "badge-green"}>{r.status === "error" ? "Failed" : r.status === "running" ? "Running" : "OK"}</span> },
          { header: "Found", cell: (r) => <span className="text-sm">{r.newDocs} new · {r.revisions} revised · {r.duplicates} already had</span> },
          { header: "Details", hideOnMobile: true, cell: (r) => <span className="block max-w-md break-words text-xs text-slate-600">{r.message}</span> },
        ]} />
      <Pagination total={total} page={page} perPage={perPage} basePath={`${BASE}/activity/`} params={errorsOnly ? { status: "error" } : {}} />
    </>
  );
}

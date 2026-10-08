import Link from "next/link";
import { Plus, Store, Pencil, ExternalLink, RotateCcw } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, TUSCARAWAS_CITIES } from "@/lib/utils";
import { businessHref } from "@/lib/links";
import { PageHeader } from "@/components/admin/page-header";
import { ListToolbar } from "@/components/admin/list-toolbar";
import { DataTable, Pagination } from "@/components/admin/data-table";
import { StatusBadge } from "@/components/admin/status-badge";
import { ActionButton } from "@/components/admin/action-button";
import { EmptyState } from "@/components/ui/empty-state";
import { pageParams, spGet, type SP } from "../_lib/list";
import { restoreBusiness } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Businesses" };

export default async function BusinessesPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireStaff();
  const sp = await searchParams;
  const q = spGet(sp, "q"), status = spGet(sp, "status"), category = spGet(sp, "category"), city = spGet(sp, "city");
  const { page, take, skip, perPage } = pageParams(sp);
  const deleted = status === "deleted";
  const where: Prisma.BusinessWhereInput = {
    deletedAt: deleted ? { not: null } : null,
    ...(status && !deleted ? { status: status as Prisma.EnumPublishStatusFilter["equals"] } : {}),
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, { address: { contains: q, mode: "insensitive" } }] } : {}),
    ...(category ? { categories: { some: { id: category } } } : {}),
    ...(city ? { city } : {}),
  };
  const [rows, total, categories, cities] = await Promise.all([
    db.business.findMany({
      where, skip, take, orderBy: { name: "asc" },
      select: {
        id: true, name: true, slug: true, city: true, status: true, logoUrl: true, isFeatured: true, isSpotlighted: true, updatedAt: true, wpId: true,
        categories: { select: { name: true } }, _count: { select: { owners: true } },
        subscriptions: { where: { status: { in: ["ACTIVE", "TRIALING"] }, OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gte: new Date() } }] }, select: { plan: { select: { name: true } }, source: true }, take: 1 },
      },
    }),
    db.business.count({ where }),
    db.businessCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
    db.business.findMany({ where: { deletedAt: null, city: { not: null } }, distinct: ["city"], select: { city: true } }),
  ]);
  const cityOptions = [...new Set([...TUSCARAWAS_CITIES, ...cities.map((c) => c.city!)])].sort();

  return (
    <>
      <PageHeader
        title="Businesses"
        description="The local business directory."
        actions={<><Link href="/admin/businesses/categories/" className="btn-secondary">Categories</Link><Link href="/admin/businesses/new/" className="btn-primary"><Plus className="h-4 w-4" /> Add business</Link></>}
      />
      <div className="card overflow-hidden">
        <ListToolbar
          placeholder="Search name, email or address…"
          filters={[
            { name: "status", label: "Status", options: [...["PUBLISHED", "DRAFT", "PENDING", "SUSPENDED", "ARCHIVED"].map((s) => ({ value: s, label: s[0] + s.slice(1).toLowerCase() })), { value: "deleted", label: "Deleted" }] },
            { name: "category", label: "Category", options: categories.map((c) => ({ value: c.id, label: c.name })) },
            { name: "city", label: "City", options: cityOptions.map((c) => ({ value: c, label: c })) },
          ]}
        />
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          empty={<EmptyState icon={Store} title={q || status || category || city ? "No businesses match your filters" : "No businesses yet"}>{!q && !status && <Link href="/admin/businesses/new/" className="font-semibold text-brand-700">Add the first business</Link>}</EmptyState>}
          columns={[
            {
              header: "Business", primary: true, className: "min-w-[240px]",
              cell: (r) => (
                <div className="flex items-center gap-3">
                  {r.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.logoUrl} alt="" className="h-10 w-10 shrink-0 rounded-lg border border-slate-200 object-contain" />
                  ) : <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-100 text-sm font-bold text-slate-500">{r.name[0]}</span>}
                  <div className="min-w-0">
                    <Link href={`/admin/businesses/${r.id}/`} className="font-semibold text-slate-900 hover:text-brand-700">{r.name}</Link>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {r.isSpotlighted && <span className="badge-blue">Spotlight</span>}
                      {r.isFeatured && <span className="badge-orange">Featured</span>}
                      {r.wpId && <span className="badge-gray">Imported</span>}
                    </div>
                  </div>
                </div>
              ),
            },
            { header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
            { header: "City", cell: (r) => r.city || "—" },
            { header: "Categories", cell: (r) => <span className="text-slate-600">{r.categories.map((c) => c.name).join(", ") || "—"}</span>, hideOnMobile: true },
            { header: "Membership", cell: (r) => r.subscriptions[0] ? <span className="badge-green">{r.subscriptions[0].plan.name}{r.subscriptions[0].source === "manual" ? " (comp)" : ""}</span> : <span className="text-slate-400">Free</span> },
            { header: "Owners", cell: (r) => r._count.owners || "—", hideOnMobile: true },
            { header: "Updated", cell: (r) => <span className="whitespace-nowrap text-slate-600">{formatDate(r.updatedAt, { month: "short", day: "numeric", year: "numeric" })}</span>, hideOnMobile: true },
          ]}
          actions={(r) => deleted ? (
            <ActionButton action={restoreBusiness} fields={{ id: r.id }}><RotateCcw className="h-4 w-4" /> Restore</ActionButton>
          ) : (
            <>
              <Link href={`/admin/businesses/${r.id}/`} className="btn-secondary btn-sm"><Pencil className="h-4 w-4" /> Edit</Link>
              {r.status === "PUBLISHED" && <a href={businessHref(r)} target="_blank" rel="noreferrer" className="btn-ghost btn-sm" aria-label={`View ${r.name}`}><ExternalLink className="h-4 w-4" /></a>}
            </>
          )}
        />
        <Pagination total={total} page={page} perPage={perPage} basePath="/admin/businesses/" params={sp} />
      </div>
    </>
  );
}

import Link from "next/link";
import { Plus, CalendarDays, Pencil, Check, X, Star, Repeat } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { upcomingEventWhere } from "@/lib/events";
import { formatDateTime } from "@/lib/utils";
import { PageHeader } from "@/components/admin/page-header";
import { LinkTabs } from "@/components/admin/tabs";
import { ListToolbar } from "@/components/admin/list-toolbar";
import { DataTable, Pagination } from "@/components/admin/data-table";
import { StatusBadge } from "@/components/admin/status-badge";
import { ActionButton } from "@/components/admin/action-button";
import { EmptyState } from "@/components/ui/empty-state";
import { pageParams, spGet, type SP } from "../_lib/list";
import { setEventStatus, toggleEventFlag } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Events" };

export default async function EventsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireStaff();
  const sp = await searchParams;
  const now = new Date();
  const TABS: { key: string; label: string; where: Prisma.EventWhereInput; order: Prisma.EventOrderByWithRelationInput }[] = [
    { key: "upcoming", label: "Upcoming", where: upcomingEventWhere(now), order: { startAt: "asc" } },
    { key: "pending", label: "Pending", where: { status: "PENDING", deletedAt: null }, order: { createdAt: "asc" } },
    { key: "past", label: "Past", where: { status: "PUBLISHED", deletedAt: null, NOT: upcomingEventWhere(now) }, order: { startAt: "desc" } },
    { key: "unpublished", label: "Unpublished", where: { status: { in: ["DRAFT", "UNPUBLISHED", "REJECTED"] }, deletedAt: null }, order: { updatedAt: "desc" } },
    { key: "archived", label: "Archived", where: { status: "ARCHIVED", deletedAt: null }, order: { startAt: "desc" } },
  ];
  const tab = TABS.find((t) => t.key === spGet(sp, "tab")) ?? TABS[0];
  const q = spGet(sp, "q"), category = spGet(sp, "category");
  const { page, take, skip, perPage } = pageParams(sp);
  const filters: Prisma.EventWhereInput = {
    ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { locationName: { contains: q, mode: "insensitive" } }, { city: { contains: q, mode: "insensitive" } }] } : {}),
    ...(category ? { categoryId: category } : {}),
  };
  const where = { AND: [tab.where, filters] };
  const [rows, total, counts, categories] = await Promise.all([
    db.event.findMany({ where, skip, take, orderBy: tab.order, include: { category: { select: { name: true } }, business: { select: { name: true } } } }),
    db.event.count({ where }),
    Promise.all(TABS.map((t) => db.event.count({ where: { AND: [t.where, filters] } }))),
    db.eventCategory.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
  ]);
  const href = (k: string) => `/admin/events/?tab=${k}${q ? `&q=${encodeURIComponent(q)}` : ""}${category ? `&category=${category}` : ""}`;
  return (
    <>
      <PageHeader title="Events" description="Community calendar. Recurring events show once here and expand on the public calendar." actions={<><Link href="/admin/events/categories/" className="btn-secondary">Categories</Link><Link href="/admin/events/new/" className="btn-primary"><Plus className="h-4 w-4" /> Create event</Link></>} />
      <LinkTabs items={TABS.map((t, i) => ({ label: t.label, href: href(t.key), active: t.key === tab.key, count: counts[i] }))} />
      <div className="card overflow-hidden">
        <ListToolbar placeholder="Search title, venue or city…" filters={[{ name: "category", label: "Category", options: categories.map((c) => ({ value: c.id, label: c.name })) }]} />
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          empty={<EmptyState icon={CalendarDays} title={tab.key === "pending" ? "No submissions waiting for review" : "No events here"}>{tab.key === "upcoming" && <Link href="/admin/events/new/" className="font-semibold text-brand-700">Create an event</Link>}</EmptyState>}
          columns={[
            {
              header: "Event", primary: true, className: "min-w-[240px]",
              cell: (r) => (
                <div>
                  <Link href={`/admin/events/${r.id}/`} className="font-semibold text-slate-900 hover:text-brand-700">{r.title}</Link>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-slate-500">
                    {r.recurrence ? <span className="inline-flex items-center gap-1"><Repeat className="h-3 w-3" /> Recurring</span> : null}
                    {r.isFeatured && <span className="badge-blue">Featured</span>}
                    {r.isSponsored && <span className="badge-sponsored">Sponsored</span>}
                    {r.category && <span>{r.category.name}</span>}
                  </div>
                </div>
              ),
            },
            { header: "When", cell: (r) => <span className="whitespace-nowrap text-slate-700">{formatDateTime(r.startAt)}</span> },
            { header: "Where", cell: (r) => <span className="text-slate-600">{[r.locationName, r.city].filter(Boolean).join(", ") || "—"}</span> },
            { header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
            { header: "Submitted by", cell: (r) => <span className="text-slate-600">{r.submitterEmail || r.business?.name || "Staff"}</span>, hideOnMobile: true },
          ]}
          actions={(r) => (
            <>
              {r.status === "PENDING" && (
                <>
                  <ActionButton action={setEventStatus} fields={{ id: r.id, status: "PUBLISHED" }} className="btn-primary btn-sm"><Check className="h-4 w-4" /> Approve</ActionButton>
                  <ActionButton action={setEventStatus} fields={{ id: r.id, status: "REJECTED" }} prompt={{ name: "reason", label: "Reason (emailed to the submitter)", required: true }} confirm={{ title: `Reject “${r.title}”?`, confirmLabel: "Reject", danger: true }}><X className="h-4 w-4" /> Reject</ActionButton>
                </>
              )}
              {r.status === "PUBLISHED" && (
                <ActionButton action={toggleEventFlag} fields={{ id: r.id, flag: "isFeatured", value: r.isFeatured ? "false" : "true" }} className={r.isFeatured ? "btn-secondary btn-sm text-amber-600" : "btn-ghost btn-sm"} title={r.isFeatured ? "Unfeature" : "Feature"}>
                  <Star className="h-4 w-4" fill={r.isFeatured ? "currentColor" : "none"} /><span className="sr-only">{r.isFeatured ? "Unfeature" : "Feature"}</span>
                </ActionButton>
              )}
              <Link href={`/admin/events/${r.id}/`} className="btn-secondary btn-sm"><Pencil className="h-4 w-4" /> Edit</Link>
            </>
          )}
        />
        <Pagination total={total} page={page} perPage={perPage} basePath="/admin/events/" params={sp} />
      </div>
    </>
  );
}

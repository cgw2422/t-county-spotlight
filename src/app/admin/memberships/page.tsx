import Link from "next/link";
import { Plus, CreditCard, Pencil, Sparkles, Receipt, ExternalLink } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { formatDate, formatMoney } from "@/lib/utils";
import { PageHeader, Notice } from "@/components/admin/page-header";
import { LinkTabs } from "@/components/admin/tabs";
import { DataTable, Pagination } from "@/components/admin/data-table";
import { StatusBadge } from "@/components/admin/status-badge";
import { ListToolbar } from "@/components/admin/list-toolbar";
import { EmptyState } from "@/components/ui/empty-state";
import { pageParams, spGet, type SP } from "../_lib/list";
import { PRODUCT_TYPES } from "./forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Memberships" };

const interval = (i: string) => (i === "MONTH" ? "/mo" : i === "YEAR" ? "/yr" : "");

export default async function MembershipsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin();
  const sp = await searchParams;
  const tab = ["plans", "products", "subscriptions", "payments"].includes(spGet(sp, "tab")) ? spGet(sp, "tab") : "plans";
  const { page, take, skip, perPage } = pageParams(sp);
  const settings = await getSettings();
  const counts = await Promise.all([db.membershipPlan.count(), db.sponsorshipProduct.count(), db.subscription.count(), db.payment.count()]);
  const tabs = [["plans", "Plans"], ["products", "Sponsorship products"], ["subscriptions", "Subscriptions"], ["payments", "Payments"]].map(([k, label], i) => ({ label, href: `/admin/memberships/?tab=${k}`, active: k === tab, count: counts[i] }));
  const status = spGet(sp, "status"), source = spGet(sp, "source");

  let body: React.ReactNode = null;
  if (tab === "plans") {
    const plans = await db.membershipPlan.findMany({ orderBy: { sortOrder: "asc" }, include: { _count: { select: { subscriptions: { where: { status: { in: ["ACTIVE", "TRIALING"] } } } } } } });
    body = (
      <div className="card overflow-hidden">
        <DataTable rows={plans} rowKey={(r) => r.id} empty={<EmptyState icon={CreditCard} title="No plans yet" />}
          columns={[
            { header: "Plan", primary: true, cell: (r) => <div><Link href={`/admin/memberships/plans/${r.id}/`} className="font-semibold text-slate-900 hover:text-brand-700">{r.name}</Link><p className="text-xs text-slate-500">{r.features.slice(0, 3).join(" · ") || r.description || "—"}</p></div> },
            { header: "Price", cell: (r) => r.interval === "FREE" ? "Free" : `${formatMoney(r.priceCents)}${interval(r.interval)}` },
            { header: "Status", cell: (r) => <div className="flex flex-wrap gap-1"><StatusBadge status={r.isActive ? "ACTIVE" : "Draft"} label={r.isActive ? "Active" : "Inactive"} />{!r.isPublic && <span className="badge-gray">Hidden</span>}{r.interval !== "FREE" && !r.stripePriceId && <span className="badge-amber">No Stripe price</span>}</div> },
            { header: "Active subs", cell: (r) => r._count.subscriptions },
          ]}
          actions={(r) => <Link href={`/admin/memberships/plans/${r.id}/`} className="btn-secondary btn-sm"><Pencil className="h-4 w-4" /> Edit</Link>}
        />
      </div>
    );
  } else if (tab === "products") {
    const products = await db.sponsorshipProduct.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { placements: true } } } });
    body = (
      <div className="card overflow-hidden">
        <DataTable rows={products} rowKey={(r) => r.id} empty={<EmptyState icon={Sparkles} title="No sponsorship products yet" />}
          columns={[
            { header: "Product", primary: true, cell: (r) => <div><Link href={`/admin/memberships/products/${r.id}/`} className="font-semibold text-slate-900 hover:text-brand-700">{r.name}</Link><p className="text-xs text-slate-500">{PRODUCT_TYPES.find((t) => t.value === r.type)?.label ?? r.type}</p></div> },
            { header: "Price", cell: (r) => `${formatMoney(r.priceCents)} / ${r.durationDays} days` },
            { header: "Status", cell: (r) => <StatusBadge status={r.isActive ? "ACTIVE" : "Draft"} label={r.isActive ? "Active" : "Inactive"} /> },
            { header: "Placements", cell: (r) => r._count.placements },
          ]}
          actions={(r) => <Link href={`/admin/memberships/products/${r.id}/`} className="btn-secondary btn-sm"><Pencil className="h-4 w-4" /> Edit</Link>}
        />
      </div>
    );
  } else if (tab === "subscriptions") {
    const q = spGet(sp, "q");
    const where = { ...(status ? { status: status as "ACTIVE" } : {}), ...(source ? { source } : {}), ...(q ? { business: { name: { contains: q, mode: "insensitive" as const } } } : {}) };
    const [rows, total] = await Promise.all([
      db.subscription.findMany({ where, skip, take, orderBy: { createdAt: "desc" }, include: { business: { select: { id: true, name: true } }, plan: { select: { name: true } } } }),
      db.subscription.count({ where }),
    ]);
    body = (
      <div className="card overflow-hidden">
        <ListToolbar placeholder="Search by business name…" filters={[
          { name: "status", label: "Status", options: ["ACTIVE", "TRIALING", "PAST_DUE", "CANCELED", "INCOMPLETE", "UNPAID"].map((s) => ({ value: s, label: s.replace("_", " ").toLowerCase() })) },
          { name: "source", label: "Source", options: [{ value: "stripe", label: "Stripe" }, { value: "manual", label: "Complimentary" }] },
        ]} />
        <DataTable rows={rows} rowKey={(r) => r.id} empty={<EmptyState icon={CreditCard} title="No subscriptions">Paid memberships appear here once Stripe webhooks confirm them, or when you grant a complimentary membership from a business page.</EmptyState>}
          columns={[
            { header: "Business", primary: true, cell: (r) => <Link href={`/admin/businesses/${r.business.id}/`} className="font-semibold text-slate-900 hover:text-brand-700">{r.business.name}</Link> },
            { header: "Plan", cell: (r) => r.plan.name },
            { header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
            { header: "Source", cell: (r) => (r.source === "manual" ? "Complimentary" : "Stripe") },
            { header: "Period end", cell: (r) => (r.currentPeriodEnd ? formatDate(r.currentPeriodEnd, { month: "short", day: "numeric", year: "numeric" }) : "—") + (r.cancelAtPeriodEnd ? " (cancels)" : "") },
          ]}
        />
        <Pagination total={total} page={page} perPage={perPage} basePath="/admin/memberships/" params={sp} />
      </div>
    );
  } else {
    const [rows, total] = await Promise.all([
      db.payment.findMany({ skip, take, orderBy: { createdAt: "desc" }, include: { business: { select: { id: true, name: true } } } }),
      db.payment.count(),
    ]);
    body = (
      <div className="card overflow-hidden">
        <DataTable rows={rows} rowKey={(r) => r.id} empty={<EmptyState icon={Receipt} title="No payments recorded">Payments are recorded from verified Stripe webhooks only.</EmptyState>}
          columns={[
            { header: "Date", primary: true, cell: (r) => <span className="whitespace-nowrap font-medium">{formatDate(r.paidAt ?? r.createdAt, { month: "short", day: "numeric", year: "numeric" })}</span> },
            { header: "Business", cell: (r) => (r.business ? <Link href={`/admin/businesses/${r.business.id}/`} className="text-brand-700 hover:underline">{r.business.name}</Link> : "—") },
            { header: "Amount", cell: (r) => <span className="tabular-nums">{formatMoney(r.amountCents, r.currency)}</span> },
            { header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
            { header: "Description", cell: (r) => r.description || "—", hideOnMobile: true },
          ]}
          actions={(r) => (r.hostedInvoiceUrl ? <a href={r.hostedInvoiceUrl} target="_blank" rel="noreferrer" className="btn-ghost btn-sm"><ExternalLink className="h-4 w-4" /> Invoice</a> : null)}
        />
        <Pagination total={total} page={page} perPage={perPage} basePath="/admin/memberships/" params={sp} />
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="Memberships & payments"
        description="Plans businesses can buy, sponsorship products, and the resulting subscriptions and payments."
        actions={tab === "plans" ? <Link href="/admin/memberships/plans/new/" className="btn-primary"><Plus className="h-4 w-4" /> New plan</Link> : tab === "products" ? <Link href="/admin/memberships/products/new/" className="btn-primary"><Plus className="h-4 w-4" /> New product</Link> : undefined}
      />
      {!settings.paymentsEnabled && <div className="mb-4"><Notice tone="info">Online payments are turned off. Turn them on in <Link className="font-semibold underline" href="/admin/settings/?tab=payments">Settings → Payments</Link> once Stripe is configured.</Notice></div>}
      <LinkTabs items={tabs} />
      {body}
    </>
  );
}

import type { Metadata } from "next";
import { ExternalLink, Receipt } from "lucide-react";
import { db } from "@/lib/db";
import { requireBusinessAccess } from "@/lib/auth";
import { formatDate, formatMoney } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/shell";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Invoices" };
export const dynamic = "force-dynamic";

const STATUS_CLS: Record<string, string> = { paid: "badge-green", failed: "badge-red" };

export default async function InvoicesPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const { business } = await requireBusinessAccess(businessId);
  const payments = await db.payment.findMany({ where: { businessId: business.id }, orderBy: { createdAt: "desc" }, take: 100 });
  return (
    <>
      <PageHeader title="Invoices & receipts" description="Every payment made for this business." />
      {payments.length === 0 ? (
        <EmptyState icon={Receipt} title="No payments yet">When you pay for a membership or sponsorship, receipts appear here.</EmptyState>
      ) : (
        <ul className="card divide-y divide-slate-100">
          {payments.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-4">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-navy-900">{p.description || "Payment"}</p>
                <p className="text-sm text-slate-500">{formatDate(p.paidAt ?? p.createdAt)}</p>
              </div>
              <span className="font-semibold tabular-nums text-navy-900">{formatMoney(p.amountCents, p.currency)}</span>
              <span className={STATUS_CLS[p.status] ?? "badge-gray"}>{p.status === "paid" ? "Paid" : p.status === "failed" ? "Failed" : p.status}</span>
              {p.hostedInvoiceUrl && (
                <a href={p.hostedInvoiceUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-sm">View <ExternalLink className="h-3.5 w-3.5" aria-hidden /></a>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

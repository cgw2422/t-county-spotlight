import type { Metadata } from "next";
import Link from "next/link";
import { KeyRound } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { TUSCARAWAS_CITIES } from "@/lib/utils";
import { addDaysKey, nyDateKey } from "@/components/public/dates";
import { PageHeader } from "@/components/public/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { findSaleByToken, garageSaleHref, isSaleEnded, todayKey } from "@/lib/garage-sales";
import { formatHours, formatSaleDates, GARAGE_SALE_LIMITS } from "@/lib/garage-sales-shared";
import { GarageSaleForm } from "../sale-form";
import { updateGarageSale } from "../actions";
import { RemoveSaleForm } from "./remove-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Manage your garage sale", robots: { index: false, follow: false }, referrer: "no-referrer" };

const STATUS_COPY: Record<string, { label: string; cls: string; text: string }> = {
  PENDING: { label: "Waiting for review", cls: "badge-amber", text: "Our team will review your sale shortly. It isn't public yet." },
  PUBLISHED: { label: "Published", cls: "badge-green", text: "Your sale is live. If you edit it, it goes back for a quick review before showing again." },
  REJECTED: { label: "Not approved", cls: "badge-red", text: "We couldn't publish this sale. You can fix it below and resubmit." },
  REMOVED: { label: "Removed", cls: "badge-gray", text: "This sale was removed and is no longer listed." },
};

export default async function ManageGarageSalePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const token = typeof sp.token === "string" ? sp.token : "";
  const saleId = typeof sp.sale === "string" ? sp.sale : "";
  let sale = token ? await findSaleByToken(token) : null;
  if (!token && saleId) {
    const user = await getCurrentUser();
    const s = user ? await db.garageSale.findUnique({ where: { id: saleId } }) : null;
    sale = s && s.userId === user!.id ? s : null;
  }

  if (!sale) {
    return (
      <div className="container-page py-12">
        <div className="mx-auto max-w-xl">
          <EmptyState icon={KeyRound} title="This manage link isn't valid">
            Check that you opened the full link from your email. Signed-in submitters can also manage sales from <Link href="/account/" className="font-semibold text-brand-700">your account</Link>.
          </EmptyState>
        </div>
      </div>
    );
  }

  const hidden: Record<string, string> = token ? { token } : { saleId: sale.id };
  const status = STATUS_COPY[sale.status];
  const today = todayKey();
  const ended = sale.status === "PUBLISHED" && isSaleEnded(sale);
  return (
    <>
      <PageHeader eyebrow="Manage your sale" title={sale.title} subtitle={`${formatSaleDates(sale.startDate, sale.endDate)} · ${formatHours(sale.dailyStart, sale.dailyEnd)}${sale.city ? ` · ${sale.city}` : ""}`} crumbs={[{ label: "Garage Sales", href: "/garage-sales/" }, { label: "Manage" }]} />
      <div className="container-page py-8 sm:py-10">
        <div className="mx-auto max-w-3xl space-y-8">
          <div className="card p-5 sm:p-6">
            <p className="flex flex-wrap items-center gap-2"><span className={status.cls}>{ended ? "Ended" : status.label}</span></p>
            <p className="mt-2 text-slate-700">{ended ? "Your sale's last day has passed, so it no longer shows in listings." : status.text}</p>
            {sale.status === "REJECTED" && sale.rejectionReason && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800"><strong>Reason:</strong> {sale.rejectionReason}</p>}
            {sale.status === "PUBLISHED" && !ended && <p className="mt-3"><Link href={garageSaleHref(sale)} className="font-semibold text-brand-700 hover:underline">View your public listing →</Link></p>}
          </div>

          {sale.status !== "REMOVED" && (
            <>
              <section aria-labelledby="edit-title">
                <h2 id="edit-title" className="section-title mb-4">Edit details</h2>
                <GarageSaleForm
                  mode="edit"
                  action={updateGarageSale}
                  hidden={hidden}
                  cities={TUSCARAWAS_CITIES}
                  minDate={nyDateKey(sale.startDate) < today ? nyDateKey(sale.startDate) : today}
                  maxDate={addDaysKey(today, GARAGE_SALE_LIMITS.maxDaysAhead)}
                  defaults={{
                    title: sale.title, saleType: sale.saleType, description: sale.description ?? "", itemCategories: sale.itemCategories,
                    startDate: nyDateKey(sale.startDate), endDate: nyDateKey(sale.endDate), dailyStart: sale.dailyStart, dailyEnd: sale.dailyEnd,
                    address: sale.address ?? "", city: sale.city ?? "", zip: sale.zip ?? "", addressVisibility: sale.addressVisibility,
                    generalLocation: sale.generalLocation ?? "", photos: sale.photos, name: sale.submitterName ?? "", email: sale.submitterEmail,
                  }}
                />
              </section>
              <section aria-labelledby="remove-title" className="card border-red-200 p-5 sm:p-6">
                <h2 id="remove-title" className="font-display text-lg font-semibold text-navy-900">Remove this sale</h2>
                <p className="mb-4 mt-1 text-sm text-slate-600">Sold out, cancelled or rained out? Remove it so nobody makes a wasted trip.</p>
                <RemoveSaleForm hidden={hidden} />
              </section>
            </>
          )}
        </div>
      </div>
    </>
  );
}

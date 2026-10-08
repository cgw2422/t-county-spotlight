import type { Metadata } from "next";
import Link from "next/link";
import { Hourglass } from "lucide-react";
import { requireBusinessAccess } from "@/lib/auth";
import { Panel } from "@/components/dashboard/shell";

export const metadata: Metadata = { title: "Payment processing" };
export const dynamic = "force-dynamic";

/** Shown after Stripe Checkout. Nothing is granted here — only the verified webhook activates a membership. */
export default async function CheckoutSuccessPage({ params, searchParams }: { params: Promise<{ businessId: string }>; searchParams: Promise<{ type?: string }> }) {
  const { businessId } = await params;
  const { type } = await searchParams;
  const { business } = await requireBusinessAccess(businessId);
  const sponsorship = type === "sponsorship";
  return (
    <Panel className="mx-auto max-w-xl text-center">
      <Hourglass className="mx-auto h-12 w-12 text-brand-600" aria-hidden />
      <h1 className="mt-4 font-display text-2xl font-semibold text-navy-900">Thank you! Processing your payment…</h1>
      <p className="mt-2 text-slate-600">
        {sponsorship
          ? "Your sponsorship will appear on your invoices once payment is confirmed. Our team will contact you to schedule it."
          : "Your membership activates as soon as payment is confirmed — usually within a minute. You'll get a receipt by email."}
      </p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
        <Link href={`/dashboard/${business.id}/membership/`} className="btn-primary">Check membership status</Link>
        <Link href={`/dashboard/${business.id}/`} className="btn-secondary">Back to dashboard</Link>
      </div>
    </Panel>
  );
}

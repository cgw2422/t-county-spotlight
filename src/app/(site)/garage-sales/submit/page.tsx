import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { TUSCARAWAS_CITIES } from "@/lib/utils";
import { addDaysKey } from "@/components/public/dates";
import { PageHeader } from "@/components/public/page-header";
import { buildMetadata } from "@/components/public/seo";
import { formStamp, todayKey } from "@/lib/garage-sales";
import { GARAGE_SALE_LIMITS } from "@/lib/garage-sales-shared";
import { GarageSaleForm } from "../sale-form";
import { submitGarageSale } from "../actions";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({
    title: "List a Garage Sale",
    description: "List your garage, yard, estate or rummage sale in Tuscarawas County for free. No account needed, and your address can stay private.",
    path: "/garage-sales/submit/",
  });
}

export default async function SubmitGarageSalePage() {
  const user = await getCurrentUser();
  const today = todayKey();
  return (
    <>
      <PageHeader
        eyebrow="Free listing"
        title="List a garage sale"
        subtitle="Garage, yard, estate and rummage sales across Tuscarawas County. Free, no account needed, and you choose whether your address is shown."
        crumbs={[{ label: "Garage Sales", href: "/garage-sales/" }, { label: "List a sale" }]}
      />
      <div className="container-page py-8 sm:py-10">
        <div className="mx-auto max-w-3xl">
          {!user && (
            <p className="mb-6 rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-700">
              No account needed. Have one? <Link href="/login/?next=/garage-sales/submit/" className="font-semibold underline">Sign in</Link> to see your sales in your account.
            </p>
          )}
          <GarageSaleForm
            mode="create"
            action={submitGarageSale}
            defaults={{ name: user?.name ?? "", email: user?.email ?? "" }}
            cities={TUSCARAWAS_CITIES}
            minDate={today}
            maxDate={addDaysKey(today, GARAGE_SALE_LIMITS.maxDaysAhead)}
            stamp={formStamp()}
          />
        </div>
      </div>
    </>
  );
}

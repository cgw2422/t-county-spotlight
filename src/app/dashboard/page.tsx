import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Search, Shield, Store } from "lucide-react";
import { getOwnedBusinesses, isStaff, requireUser } from "@/lib/auth";
import { PlainShell } from "@/components/dashboard/shell";
import { StatusBadge } from "@/components/dashboard/shell";
import { LogoutButton } from "@/components/account/logout-button";

export const dynamic = "force-dynamic";

const ALLOWED_TO = ["membership", "profile", "photos", "events", "specials", "updates", "invoices"];

export default async function DashboardHome({ searchParams }: { searchParams: Promise<{ to?: string }> }) {
  const user = await requireUser("/dashboard/");
  const { to } = await searchParams;
  const businesses = await getOwnedBusinesses(user.id);
  const sub = to && ALLOWED_TO.includes(to) ? `${to}/` : "";
  if (businesses.length === 1) redirect(`/dashboard/${businesses[0].id}/${sub}`);

  if (businesses.length === 0) {
    return (
      <PlainShell>
        <div className="mx-auto max-w-xl text-center">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-sunset-500 text-white shadow"><Store className="h-8 w-8" aria-hidden /></span>
          <h1 className="mt-5 font-display text-3xl font-semibold text-navy-900">Claim or add your business</h1>
          <p className="mt-3 text-slate-600">
            Your account isn&apos;t connected to a business yet. Tell us about your business — or claim an existing listing — and our team will
            connect it to your account, usually within a couple of business days.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <Link href="/list-your-business/" className="btn-primary min-h-14 text-base">Add my business</Link>
            <Link href="/businesses/" className="btn-secondary min-h-14 text-base"><Search className="h-5 w-5" aria-hidden /> Find my listing to claim</Link>
          </div>
          <p className="mt-6 text-sm text-slate-500">Listing your business is free. Already applied? We&apos;ll email you as soon as it&apos;s connected.</p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            {isStaff(user) && <Link href="/admin/" className="btn-secondary"><Shield className="h-4 w-4" aria-hidden /> Go to admin</Link>}
            <Link href="/account/" className="btn-ghost">My account</Link>
            <LogoutButton className="btn-ghost" />
          </div>
        </div>
      </PlainShell>
    );
  }

  return (
    <PlainShell>
      <h1 className="font-display text-3xl font-semibold text-navy-900">Your businesses</h1>
      <p className="mt-2 text-slate-600">Choose a business to manage.</p>
      <ul className="mt-6 grid gap-3">
        {businesses.map((b) => (
          <li key={b.id}>
            <Link href={`/dashboard/${b.id}/${sub}`} className="card card-hover flex min-h-16 items-center gap-4 p-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-navy-800 text-white"><Store className="h-6 w-6" aria-hidden /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-navy-900">{b.name}</span>
                <span className="text-sm text-slate-500">{b.city || "Tuscarawas County"}</span>
              </span>
              <StatusBadge status={b.status} />
              <ChevronRight className="h-5 w-5 text-slate-400" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/account/" className="btn-ghost">My account</Link>
        <LogoutButton className="btn-ghost" />
      </div>
    </PlainShell>
  );
}

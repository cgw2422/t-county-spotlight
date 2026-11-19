import Link from "next/link";
import { Clock, LayoutDashboard, Store, XCircle } from "lucide-react";
import { getBusinessRequests } from "@/lib/application-flow";
import { decodePlainText } from "@/lib/text";

/**
 * My T County and /account/: business listing requests made from this account and the listings it manages.
 * Pending requests never give access; once approved (BusinessOwner row exists) the listing shows "Manage Listing".
 * Renders nothing when the account has neither.
 */
export async function MyBusinessRequests({ userId }: { userId: string }) {
  const { apps, managed } = await getBusinessRequests(userId);
  const pending = apps.filter((a) => a.status === "PENDING");
  const declined = apps.filter((a) => a.status === "REJECTED");
  if (!pending.length && !declined.length && !managed.length) return null;
  return (
    <section aria-labelledby="my-business-requests" className="space-y-3" data-testid="my-business-requests">
      <h2 id="my-business-requests" className="flex items-center gap-2 font-display text-xl font-bold text-navy-900"><Store className="h-5 w-5 text-hillside-600" aria-hidden /> My business listings</h2>
      {pending.map((a) => (
        <div key={a.id} className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950" data-testid="business-approval-pending">
          <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden />
          <div>
            <p className="font-semibold">Business approval pending</p>
            <p className="mt-0.5">Your request for <strong>{decodePlainText(a.businessName)}</strong> is under review. You can use your T County Connect account now. You&rsquo;ll be able to manage the listing once your request is approved.</p>
          </div>
        </div>
      ))}
      {managed.length > 0 && (
        <ul className="card divide-y divide-slate-100">
          {managed.map((m) => (
            <li key={m.business.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <span className="min-w-0">
                <span className="block font-semibold text-navy-900">{decodePlainText(m.business.name)}</span>
                <span className="text-sm text-slate-500">{m.role === "OWNER" ? "Owner" : "Manager"}{m.business.status === "SUSPENDED" ? " · suspended" : m.business.status !== "PUBLISHED" ? " · not published yet" : ""}</span>
              </span>
              {m.business.status !== "SUSPENDED" && (
                <Link href={`/dashboard/${m.business.id}/`} className="btn-primary btn-sm min-h-11" data-testid="manage-listing-link"><LayoutDashboard className="h-4 w-4" aria-hidden /> Manage Listing</Link>
              )}
            </li>
          ))}
        </ul>
      )}
      {declined.map((a) => (
        <p key={a.id} className="flex items-start gap-2 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600" data-testid="business-request-declined">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
          <span>Your request for <strong>{decodePlainText(a.businessName)}</strong> was not approved. Your account isn&rsquo;t affected. Questions? Reply to the email we sent you.</span>
        </p>
      ))}
    </section>
  );
}

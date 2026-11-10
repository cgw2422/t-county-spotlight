import Link from "next/link";
import { Plus, Tag } from "lucide-react";
import { getUserGarageSales, isSaleEnded } from "@/lib/garage-sales";
import { formatSaleDates } from "@/lib/garage-sales-shared";

const LABEL: Record<string, [string, string]> = {
  PENDING: ["Waiting for review", "badge-amber"], PUBLISHED: ["Published", "badge-green"], REJECTED: ["Not approved", "badge-red"], REMOVED: ["Removed", "badge-gray"],
};

/** Account page: the signed-in resident's garage sales with manage links. Renders nothing if they have none. */
export async function MyGarageSales({ userId }: { userId: string }) {
  const sales = await getUserGarageSales(userId);
  if (!sales.length) return null;
  return (
    <section aria-labelledby="my-garage-sales">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="my-garage-sales" className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500"><Tag className="h-4 w-4" aria-hidden /> My garage sales <span className="badge-gray">{sales.length}</span></h2>
        <Link href="/garage-sales/submit/" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700"><Plus className="h-4 w-4" aria-hidden /> List a sale</Link>
      </div>
      <ul className="card divide-y divide-slate-100">
        {sales.map((s) => {
          const ended = s.status === "PUBLISHED" && isSaleEnded(s);
          const [label, cls] = ended ? ["Ended", "badge-gray"] : LABEL[s.status];
          return (
            <li key={s.id} className="flex flex-wrap items-center gap-3 p-3">
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-navy-900">{s.title}</span>
                <span className="block text-sm text-slate-500">{formatSaleDates(s.startDate, s.endDate)}{s.city ? ` · ${s.city}` : ""}</span>
              </span>
              <span className={cls}>{label}</span>
              {s.status !== "REMOVED" && <Link href={`/garage-sales/manage/?sale=${s.id}`} className="btn-secondary btn-sm">Manage</Link>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

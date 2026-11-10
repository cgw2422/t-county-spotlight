import Link from "next/link";
import { Lightbulb, Plus } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { getUserSuggestions, SUGGESTION_STATUS_COPY, suggestionKindLabel } from "@/lib/suggestions";

/** Account page: the signed-in resident's suggestions with manage links. Renders nothing if they have none. */
export async function MySuggestions({ userId }: { userId: string }) {
  const rows = await getUserSuggestions(userId);
  if (!rows.length) return null;
  return (
    <section aria-labelledby="my-suggestions">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="my-suggestions" className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500"><Lightbulb className="h-4 w-4" aria-hidden /> My suggestions <span className="badge-gray">{rows.length}</span></h2>
        <Link href="/submit/" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700"><Plus className="h-4 w-4" aria-hidden /> Share something</Link>
      </div>
      <ul className="card divide-y divide-slate-100">
        {rows.map((s) => {
          const st = SUGGESTION_STATUS_COPY[s.status];
          return (
            <li key={s.id} className="flex flex-wrap items-center gap-3 p-3">
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-navy-900">{s.title}</span>
                <span className="block text-sm text-slate-500">{suggestionKindLabel(s.kind)} · {formatDate(s.createdAt)}</span>
              </span>
              <span className={st.cls}>{st.label}</span>
              <Link href={`/submit/manage/?suggestion=${s.id}`} className="btn-secondary btn-sm">Manage</Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

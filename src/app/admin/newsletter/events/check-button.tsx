"use client";
import { useActionState } from "react";
import { ExternalLink, Search } from "lucide-react";
import { SubmitButton } from "@/components/ui/submit-button";
import { checkBeehiivDraftsAction, type CheckState } from "./actions";

/** "Check beehiiv": lists recent beehiiv drafts and matches this request's exact title. */
export function CheckBeehiivButton({ token, draftsUrl, compact }: { token: string; draftsUrl: string; compact?: boolean }) {
  const [res, action] = useActionState<CheckState, FormData>(checkBeehiivDraftsAction, null);
  return (
    <div className={compact ? "flex flex-col items-end gap-1" : "min-w-0"}>
      <form action={action}>
        <input type="hidden" name="token" value={token} />
        <SubmitButton className="btn-secondary btn-sm" pendingText="Checking…" data-testid="check-beehiiv"><Search className="h-4 w-4" /> Check beehiiv</SubmitButton>
      </form>
      {res && (
        <div className="mt-2 max-w-md text-xs" data-testid="check-result" data-status={res.status}>
          <p className={res.status === "recovered" ? "font-semibold text-emerald-800" : "text-slate-700"}>{res.message}</p>
          {res.status === "recovered" && <a href={res.editUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 font-semibold text-brand-700 underline"><ExternalLink className="h-3 w-3" /> Open draft in beehiiv</a>}
          {"matches" in res && res.matches.length > 1 && (
            <ul className="mt-1 list-disc pl-4">{res.matches.map((m) => <li key={m.id}>{m.title} <span className="text-slate-500">({m.id})</span></li>)}</ul>
          )}
          {!compact && "drafts" in res && res.drafts.length > 0 && res.status !== "recovered" && (
            <details className="mt-1"><summary className="cursor-pointer">Recent beehiiv drafts ({res.drafts.length})</summary>
              <ul className="mt-1 list-disc pl-4">{res.drafts.map((d) => <li key={d.id}>{d.title || "(untitled)"}</li>)}</ul>
            </details>
          )}
          {res.status !== "recovered" && <a href={draftsUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block underline">Open beehiiv posts</a>}
        </div>
      )}
    </div>
  );
}

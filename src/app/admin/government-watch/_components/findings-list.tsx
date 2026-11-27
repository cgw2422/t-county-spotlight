"use client";
import { startTransition, useActionState, useState } from "react";
import Link from "next/link";
import { CheckSquare, EyeOff, FileText, Loader2, Newspaper, Square, Undo2, Wand2 } from "lucide-react";
import type { ActionState } from "@/components/ui/form-message";
import { toast } from "@/components/admin/toast";
import { ACTION_STATUS_BADGE, ACTION_STATUS_LABEL, CATEGORY_LABEL, FINDING_REVIEW_LABEL, PRIORITY_BADGE, PRIORITY_LABEL, isOneOf, ACTION_STATUSES, CATEGORIES, PRIORITIES, FINDING_REVIEW } from "@/lib/gov-watch/shared";
import { draftArticleAction, setFindingStatusAction } from "../actions";

export type FindingRow = {
  id: string; headline: string; detail: string; category: string; actionStatus: string; priority: string; reviewStatus: string;
  amount: string | null; voteResult: string | null; pageNumber: number | null; quote: string | null; eventDate: string | null;
  articleId: string | null; documentId: string; documentTitle: string; documentUrl: string; sourceName: string | null; community: string | null; meetingDate: string | null;
};

function useAction(action: (p: ActionState, fd: FormData) => Promise<ActionState>, onOk?: () => void) {
  const [, dispatch, pending] = useActionState(async (prev: ActionState, fd: FormData) => {
    const r = await action(prev, fd);
    if (r?.error) toast(r.error, "error");
    else if (r?.message) toast(r.message, "success");
    if (!r?.error) onOk?.();
    return r;
  }, null as ActionState);
  return { run: (fields: Record<string, string>) => { const fd = new FormData(); for (const [k, v] of Object.entries(fields)) fd.append(k, v); startTransition(() => dispatch(fd)); }, pending };
}

/** Potential stories with checkboxes: mark reviewed / ignored / published, or draft an article from the selection. */
export function FindingsList({ rows }: { rows: FindingRow[] }) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const status = useAction(setFindingStatusAction, () => setSel(new Set()));
  const draft = useAction(draftArticleAction);
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const ids = [...sel].join(",");
  const busy = status.pending || draft.pending;
  if (!rows.length) return null;
  return (
    <div>
      <div className="sticky top-16 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white/95 p-2 shadow-sm backdrop-blur" data-testid="findings-toolbar">
        <button type="button" className="btn-ghost btn-sm" onClick={() => setSel(sel.size === rows.length ? new Set() : new Set(rows.map((r) => r.id)))}>
          {sel.size === rows.length ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />} {sel.size ? `${sel.size} selected` : "Select all"}
        </button>
        <span className="mx-1 h-5 w-px bg-slate-200" />
        <button type="button" disabled={!sel.size || busy} className="btn-secondary btn-sm" onClick={() => status.run({ ids, status: "reviewed" })} data-testid="mark-reviewed"><CheckSquare className="h-4 w-4" /> Reviewed</button>
        <button type="button" disabled={!sel.size || busy} className="btn-secondary btn-sm" onClick={() => status.run({ ids, status: "ignored" })} data-testid="mark-ignored"><EyeOff className="h-4 w-4" /> Ignore</button>
        <button type="button" disabled={!sel.size || busy} className="btn-secondary btn-sm" onClick={() => status.run({ ids, status: "published" })} data-testid="mark-published"><Newspaper className="h-4 w-4" /> Published</button>
        <button type="button" disabled={!sel.size || busy} className="btn-ghost btn-sm" onClick={() => status.run({ ids, status: "new" })}><Undo2 className="h-4 w-4" /> Back to new</button>
        <button type="button" disabled={!sel.size || busy} className="btn-primary btn-sm ml-auto" onClick={() => draft.run({ findingIds: ids })} data-testid="draft-article">
          {draft.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />} {draft.pending ? "Drafting…" : "Draft article"}
        </button>
      </div>
      <ul className="space-y-3" data-testid="findings">
        {rows.map((f) => (
          <li key={f.id} className={`card p-4 ${sel.has(f.id) ? "ring-2 ring-brand-300" : ""}`} data-testid="finding">
            <div className="flex gap-3">
              <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 rounded border-slate-300" checked={sel.has(f.id)} onChange={() => toggle(f.id)} aria-label={`Select: ${f.headline}`} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  {isOneOf(PRIORITIES, f.priority) && <span className={PRIORITY_BADGE[f.priority]}>{PRIORITY_LABEL[f.priority]} priority</span>}
                  {isOneOf(ACTION_STATUSES, f.actionStatus) && <span className={ACTION_STATUS_BADGE[f.actionStatus]} data-testid="action-status">{ACTION_STATUS_LABEL[f.actionStatus]}</span>}
                  {isOneOf(CATEGORIES, f.category) && <span className="badge-gray">{CATEGORY_LABEL[f.category]}</span>}
                  {f.reviewStatus !== "new" && isOneOf(FINDING_REVIEW, f.reviewStatus) && <span className="badge-blue">{FINDING_REVIEW_LABEL[f.reviewStatus]}</span>}
                </div>
                <h3 className="mt-1.5 font-display text-base font-bold text-navy-900">{f.headline}</h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-700">{f.detail}</p>
                {(f.amount || f.voteResult || f.eventDate) && (
                  <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
                    {f.amount && <span><strong>Amount:</strong> {f.amount}</span>}
                    {f.voteResult && <span><strong>Vote:</strong> {f.voteResult}</span>}
                    {f.eventDate && <span><strong>Date:</strong> {f.eventDate}</span>}
                  </p>
                )}
                {f.quote && <blockquote className="mt-2 border-l-2 border-slate-200 pl-3 text-sm italic text-slate-600">“{f.quote}”</blockquote>}
                <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                  <span>{f.sourceName ?? "Unassigned source"}{f.meetingDate ? ` · meeting ${f.meetingDate}` : ""}</span>
                  <Link href={f.documentUrl} className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline"><FileText className="h-3.5 w-3.5" /> {f.documentTitle}{f.pageNumber ? `, page ${f.pageNumber}` : ""}</Link>
                  {f.articleId && <Link href={`/admin/articles/${f.articleId}/`} className="font-medium text-brand-700 hover:underline">Article draft →</Link>}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { KeyRound } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { formatDate } from "@/lib/utils";
import { nyDateKey } from "@/components/public/dates";
import { PageHeader } from "@/components/public/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { findSuggestionByToken, SUGGESTION_STATUS_COPY, suggestionKindLabel, type SuggestionKindValue } from "@/lib/suggestions";
import { SuggestionForm } from "../suggest/suggestion-form";
import { updateSuggestion } from "../actions";
import { WithdrawSuggestionForm } from "./withdraw-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Manage your suggestion", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function ManageSuggestionPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const token = typeof sp.token === "string" ? sp.token : "";
  const id = typeof sp.suggestion === "string" ? sp.suggestion : "";
  let s = token ? await findSuggestionByToken(token) : null;
  if (!token && id) {
    const user = await getCurrentUser();
    const row = user ? await db.communitySuggestion.findUnique({ where: { id } }) : null;
    s = row && row.userId === user!.id ? row : null;
  }

  if (!s) {
    return (
      <div className="container-page py-12">
        <div className="mx-auto max-w-xl">
          <EmptyState icon={KeyRound} title="This manage link isn't valid">
            Check that you opened the full link from your email. Signed-in submitters can also find their suggestions in <Link href="/account/" className="font-semibold text-brand-700">their account</Link>.
          </EmptyState>
        </div>
      </div>
    );
  }

  const hidden: Record<string, string> = token ? { token } : { suggestionId: s.id };
  const status = SUGGESTION_STATUS_COPY[s.status];
  const editable = s.status === "PENDING" || s.status === "REJECTED";
  return (
    <>
      <PageHeader eyebrow="Manage your suggestion" title={s.title} subtitle={`${suggestionKindLabel(s.kind)} · sent ${formatDate(s.createdAt)}`} crumbs={[{ label: "Share something", href: "/submit/" }, { label: "Manage" }]} />
      <div className="container-page py-8 sm:py-10">
        <div className="mx-auto max-w-3xl space-y-8">
          <div className="card p-5 sm:p-6" data-testid="suggestion-status">
            <p><span className={status.cls}>{status.label}</span></p>
            <p className="mt-2 text-slate-700">{status.text}</p>
            {s.status === "REJECTED" && s.rejectionReason && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800"><strong>Reason:</strong> {s.rejectionReason}</p>}
          </div>
          {editable && (
            <>
              <section aria-labelledby="edit-title">
                <h2 id="edit-title" className="section-title mb-4">{s.status === "REJECTED" ? "Edit and resubmit" : "Edit your suggestion"}</h2>
                <SuggestionForm
                  mode="edit"
                  action={updateSuggestion}
                  hidden={hidden}
                  submitLabel={s.status === "REJECTED" ? "Resubmit for review" : "Save changes"}
                  defaults={{
                    kind: s.kind as SuggestionKindValue, title: s.title, details: s.details, city: s.city ?? "", address: s.address ?? "", linkUrl: s.linkUrl ?? "",
                    eventDate: s.eventDate ? nyDateKey(s.eventDate) : "", photos: s.photos, name: s.submitterName ?? "", email: s.submitterEmail,
                  }}
                />
              </section>
              <section aria-labelledby="withdraw-title" className="card border-red-200 p-5 sm:p-6">
                <h2 id="withdraw-title" className="font-display text-lg font-semibold text-navy-900">Withdraw this suggestion</h2>
                <p className="mb-4 mt-1 text-sm text-slate-600">Changed your mind or the information is out of date? Withdraw it so our team doesn&apos;t review it.</p>
                <WithdrawSuggestionForm hidden={hidden} />
              </section>
            </>
          )}
        </div>
      </div>
    </>
  );
}

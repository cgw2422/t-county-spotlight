import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, ExternalLink, RotateCcw, Sparkles, X } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/utils";
import { Card, Notice, PageHeader } from "@/components/admin/page-header";
import { ActionButton } from "@/components/admin/action-button";
import { StatusBadge } from "@/components/admin/status-badge";
import { suggestionKindLabel } from "@/lib/suggestions-shared";
import { createFromSuggestion, setSuggestionStatus } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Suggestion" };

function resultHref(ref: string | null) {
  if (!ref) return null;
  const [type, id] = ref.split(":");
  if (type === "BusinessUpdate") return `/admin/updates/${id}/`;
  if (type === "Article") return `/admin/articles/${id}/`;
  if (type === "ExploreCollectionItem") return "/admin/collections/";
  return null;
}

const CREATE_LABEL: Record<string, string | undefined> = {
  BUSINESS_OPENING: "Create New & Coming Soon draft",
  COMMUNITY_UPDATE: "Create community update draft",
};

const NEXT_STEP: Record<string, string> = {
  BUSINESS_OPENING: "Creates a draft New & Coming Soon entry with these details. Verify the business and any dates, then publish it from the edit screen.",
  COMMUNITY_UPDATE: "Creates a draft community update (announcement) with these details and community. Edit, set “Show prominently until”, then publish.",
  ATTRACTION: "Add the place to an Explore collection if it fits (Admin → Explore collections), using the details below. Then mark this approved.",
  VOLUNTEER: "Verify with the organization. If they aren't on T County Gives yet, invite them to register so they can post opportunities themselves. Then mark this approved.",
  OTHER: "Use the details below where they fit, then mark this approved (or reject with a reason).",
};

export default async function SuggestionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  const s = await db.communitySuggestion.findUnique({ where: { id } });
  if (!s) notFound();
  const [account, reviewer] = await Promise.all([
    s.userId ? db.user.findUnique({ where: { id: s.userId }, select: { email: true, name: true } }) : null,
    s.reviewedById ? db.user.findUnique({ where: { id: s.reviewedById }, select: { email: true, name: true } }) : null,
  ]);
  const created = resultHref(s.resultRef);
  const open = s.status === "PENDING" || s.status === "REJECTED";
  const canCreate = !!CREATE_LABEL[s.kind] && !s.resultRef && s.status !== "WITHDRAWN";
  return (
    <>
      <PageHeader
        title={s.title}
        back={{ href: "/admin/suggestions/", label: "Resident suggestions" }}
        eyebrow={<div className="flex flex-wrap gap-1.5"><StatusBadge status={s.status} /><span className="badge-blue">{suggestionKindLabel(s.kind)}</span></div>}
        description={`Submitted ${formatDateTime(s.createdAt)}${s.city ? ` · ${s.city}` : ""}`}
        actions={
          <>
            {canCreate && <ActionButton action={createFromSuggestion} fields={{ id: s.id }} className="btn-primary btn-sm"><Sparkles className="h-4 w-4" /> {CREATE_LABEL[s.kind]}</ActionButton>}
            {open && <ActionButton action={setSuggestionStatus} fields={{ id: s.id, status: "APPROVED" }} prompt={{ name: "note", label: "Staff note (optional, private)" }} confirm={{ title: "Mark approved?", body: "No content is created. Use this when you've added it elsewhere or it needs no page.", confirmLabel: "Mark approved" }} reloadOnSuccess><Check className="h-4 w-4" /> Mark approved</ActionButton>}
            {s.status === "PENDING" && <ActionButton action={setSuggestionStatus} fields={{ id: s.id, status: "REJECTED" }} prompt={{ name: "reason", label: "Reason (emailed to the submitter)", required: true }} confirm={{ title: "Reject this suggestion?", confirmLabel: "Reject", danger: true }} reloadOnSuccess><X className="h-4 w-4" /> Reject</ActionButton>}
            {(s.status === "APPROVED" || s.status === "REJECTED" || s.status === "WITHDRAWN") && !s.resultRef && <ActionButton action={setSuggestionStatus} fields={{ id: s.id, status: "PENDING" }} reloadOnSuccess><RotateCcw className="h-4 w-4" /> Move to pending</ActionButton>}
          </>
        }
      />
      {s.status === "REJECTED" && s.rejectionReason && <div className="mb-4"><Notice tone="danger" title="Rejected">{s.rejectionReason}</Notice></div>}
      {created && <div className="mb-4"><Notice tone="success" title="Content created">Staff created content from this suggestion. <Link href={created} className="font-semibold underline">Open it</Link>. The submitter is emailed when it&apos;s published.</Notice></div>}
      {!s.resultRef && s.status !== "WITHDRAWN" && <div className="mb-4"><Notice tone="info" title="Next step">{NEXT_STEP[s.kind] ?? NEXT_STEP.OTHER}{s.kind === "ATTRACTION" && <> <Link href="/admin/collections/" className="font-semibold underline">Open Explore collections</Link></>}{s.kind === "VOLUNTEER" && <> <Link href="/admin/volunteer/" className="font-semibold underline">Volunteer opportunities</Link></>}</Notice></div>}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <Card title="Details">
            <dl className="space-y-3 text-sm">
              <div><dt className="text-slate-500">Title</dt><dd className="font-medium text-slate-900">{s.title}</dd></div>
              <div><dt className="text-slate-500">Details</dt><dd className="whitespace-pre-line text-slate-800">{s.details}</dd></div>
              <div><dt className="text-slate-500">Community</dt><dd>{s.city || "—"}</dd></div>
              <div><dt className="text-slate-500">Address</dt><dd>{s.address || "—"}</dd></div>
              <div><dt className="text-slate-500">Link</dt><dd className="break-all">{s.linkUrl ? <a href={s.linkUrl} target="_blank" rel="noopener noreferrer nofollow" className="text-brand-700 hover:underline">{s.linkUrl} <ExternalLink className="inline h-3.5 w-3.5" /></a> : "—"}</dd></div>
              <div><dt className="text-slate-500">{s.kind === "BUSINESS_OPENING" ? "Opening date reported by the resident (verify — not copied automatically)" : "Date"}</dt><dd>{s.eventDate ? formatDate(s.eventDate) : "—"}</dd></div>
            </dl>
          </Card>
          {s.photos.length > 0 && (
            <Card title="Photos" description="Uploaded by the submitter. Check they have permission before using them.">
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {s.photos.map((p, i) => (
                  <li key={p}>
                    <a href={p} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p} alt={`Photo ${i + 1}`} className="aspect-square w-full rounded-lg object-cover" />
                    </a>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
        <aside className="space-y-4">
          <Card title="Submitter (private)">
            <dl className="space-y-2 text-sm">
              <div><dt className="text-slate-500">Name</dt><dd className="font-medium text-slate-900">{s.submitterName || "—"}</dd></div>
              <div><dt className="text-slate-500">Email</dt><dd className="break-all font-medium"><a href={`mailto:${s.submitterEmail}`} className="text-brand-700 hover:underline">{s.submitterEmail}</a></dd></div>
              <div><dt className="text-slate-500">Account</dt><dd>{account ? account.name || account.email : "Submitted without an account"}</dd></div>
            </dl>
          </Card>
          <Card title="History">
            <dl className="space-y-2 text-sm">
              <div><dt className="text-slate-500">Submitted</dt><dd>{formatDateTime(s.createdAt)}</dd></div>
              <div><dt className="text-slate-500">Last updated</dt><dd>{formatDateTime(s.updatedAt)}</dd></div>
              {s.reviewedAt && <div><dt className="text-slate-500">Reviewed</dt><dd>{formatDateTime(s.reviewedAt)}{reviewer ? ` by ${reviewer.name || reviewer.email}` : ""}</dd></div>}
              {s.resultRef && <div><dt className="text-slate-500">Result</dt><dd className="break-all">{s.resultRef}</dd></div>}
            </dl>
          </Card>
        </aside>
      </div>
    </>
  );
}

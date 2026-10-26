import Link from "next/link";
import { ExternalLink, HandHelping, Inbox, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import { requireOrgAccess } from "@/lib/gives/access";
import { NEED_CATEGORY_LABEL, NEED_STATUS_LABEL, needHref } from "@/lib/gives/constants";
import { pledgedTotals } from "@/lib/gives/queries";
import { NeedProgress, UrgencyBadge } from "@/components/gives/badges";
import { PageHeader, Hint } from "@/components/dashboard/shell";
import { EmptyState } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";
export const metadata = { title: "Needs & wish list" };

export default async function OrgNeedsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const { org } = await requireOrgAccess(orgId);
  const root = `/organization/${org.id}/`;
  const needs = await db.communityNeed.findMany({
    where: { organizationId: org.id, deletedAt: null },
    orderBy: [{ status: "asc" }, { deadline: "asc" }, { createdAt: "desc" }],
    include: { _count: { select: { pledges: { where: { status: "PLEDGED" } } } } },
  });
  const pledged = await pledgedTotals(needs.map((n) => n.id));
  const active = needs.filter((n) => ["OPEN", "PARTIALLY_FULFILLED", "DRAFT"].includes(n.status));
  const done = needs.filter((n) => !active.includes(n));
  const row = (n: (typeof needs)[number]) => (
    <li key={n.id}>
      <Link href={`${root}needs/${n.id}/`} className="card card-hover block p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <UrgencyBadge urgency={n.urgency} />
          <span className="badge-gray">{NEED_CATEGORY_LABEL[n.category]}</span>
          <span className={n.status === "DRAFT" ? "badge-gray" : n.status === "FULFILLED" ? "badge-green" : "badge-blue"}>{NEED_STATUS_LABEL[n.status]}</span>
          {n.isWishList && <span className="badge-orange">Wish list</span>}
          {n._count.pledges > 0 && <span className="badge-amber"><Inbox className="h-3 w-3" aria-hidden /> {n._count.pledges} to confirm</span>}
        </div>
        <h3 className="mt-2 font-semibold text-navy-900">{n.title}</h3>
        {n.deadline && <p className="text-sm text-slate-500">Needed by {formatDate(n.deadline)}</p>}
        <div className="mt-3"><NeedProgress received={n.quantityReceived} needed={n.quantityNeeded} unit={n.unit} pledged={pledged.get(n.id)} compact /></div>
      </Link>
    </li>
  );
  return (
    <>
      <PageHeader
        title="Needs & wish list"
        description="Post what you need. People pledge on your page, then you confirm what actually arrived."
        action={<Link href={`${root}needs/new/`} className="btn-primary"><Plus className="h-4 w-4" aria-hidden /> Post a need</Link>}
      />
      {org.wishlistUrl && (
        <p className="mb-4 flex items-center gap-2 text-sm text-slate-600">Your online wish list: <a href={org.wishlistUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline">open <ExternalLink className="h-3.5 w-3.5" aria-hidden /></a></p>
      )}
      {needs.length === 0 ? (
        <EmptyState icon={HandHelping} title="No needs posted yet">
          Coats, canned goods, school supplies, a few extra hands on Saturday — post it and neighbors can pledge to help.
          <span className="mt-4 block"><Link href={`${root}needs/new/`} className="btn-primary btn-sm">Post your first need</Link></span>
        </EmptyState>
      ) : (
        <div className="space-y-8">
          {active.length > 0 && <ul className="grid gap-3">{active.map(row)}</ul>}
          {done.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">Fulfilled & closed</h2>
              <ul className="grid gap-3 opacity-90">{done.map(row)}</ul>
            </section>
          )}
        </div>
      )}
      {org.status === "APPROVED" && needs.some((n) => n.status === "OPEN") && (
        <Hint className="mt-8">Share your needs! Each one has its own public page, for example <Link className="font-semibold text-brand-700 underline" href={needHref(needs.find((n) => n.status === "OPEN")!)}>this one</Link>.</Hint>
      )}
    </>
  );
}

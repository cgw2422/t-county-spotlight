import Link from "next/link";
import { AlertTriangle, BadgeCheck, CalendarDays, Clock, Eye, EyeOff, HandHelping, Inbox, PencilLine, UsersRound } from "lucide-react";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import { requireOrgAccess } from "@/lib/gives/access";
import { KIND_LABEL, orgHref } from "@/lib/gives/constants";
import { OrgStatusBadge, PublishBadge } from "@/components/gives/badges";
import { ActionButton } from "@/components/admin/action-button";
import { setOrgPublishedAction } from "./actions";
import { PageHeader, Hint } from "@/components/dashboard/shell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Overview" };

function Stat({ label, value, href, icon: Icon, tone = "bg-brand-50 text-brand-700" }: { label: string; value: number; href: string; icon: typeof Inbox; tone?: string }) {
  return (
    <Link href={href} className="card card-hover flex items-center gap-3 p-4">
      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${tone}`}><Icon className="h-5 w-5" aria-hidden /></span>
      <span className="min-w-0">
        <span className="block text-2xl font-bold tabular-nums text-navy-900">{value}</span>
        <span className="block text-sm text-slate-600">{label}</span>
      </span>
    </Link>
  );
}

export default async function OrgOverview({ params, searchParams }: { params: Promise<{ orgId: string }>; searchParams: Promise<{ registered?: string; denied?: string }> }) {
  const { orgId } = await params;
  const sp = await searchParams;
  const { org, role, staff } = await requireOrgAccess(orgId);
  const canPublish = role === "OWNER" || staff;
  const now = new Date();
  const root = `/organization/${org.id}/`;
  const [openNeeds, pendingPledges, upcomingOpps, activeSignups, pendingEvents] = await Promise.all([
    db.communityNeed.count({ where: { organizationId: org.id, deletedAt: null, status: { in: ["OPEN", "PARTIALLY_FULFILLED"] } } }),
    db.needPledge.count({ where: { status: "PLEDGED", need: { organizationId: org.id, deletedAt: null } } }),
    db.volunteerOpportunity.count({ where: { organizationId: org.id, deletedAt: null, status: "PUBLISHED", OR: [{ isOngoing: true }, { endAt: { gte: now } }, { endAt: null, startAt: { gte: now } }, { startAt: null, endAt: null }] } }),
    db.volunteerSignup.count({ where: { status: { in: ["REGISTERED", "CONFIRMED", "WAITLISTED"] }, opportunity: { organizationId: org.id, deletedAt: null, OR: [{ isOngoing: true }, { endAt: { gte: now } }, { endAt: null, startAt: { gte: now } }, { startAt: null, endAt: null }] } } }),
    db.event.count({ where: { organizationId: org.id, status: "PENDING", deletedAt: null } }),
  ]);
  const missing = [
    !org.logoUrl && "a logo",
    !org.description && !org.mission && "a description or mission",
    !org.city && "your town",
    !org.donationUrl && org.kind !== "CHURCH" && "a donation link",
    org.kind === "CHURCH" && !org.serviceTimes && "service times",
  ].filter(Boolean) as string[];

  return (
    <>
      <PageHeader title={`Welcome, ${org.name}`} description={`${KIND_LABEL[org.kind]} · ${org.city || "Tuscarawas County"}`} />
      {sp.denied && <p role="alert" className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">Only owners and admins can open that page.</p>}

      {org.status === "PENDING" && (
        <div className="mb-6 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900 sm:p-5">
          <Clock className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <div>
            <p className="font-semibold">{sp.registered ? "Thanks for registering! " : ""}Your organization is waiting for review</p>
            <p className="mt-1 text-sm">Our team checks every new organization, usually within a couple of days. Meanwhile, finish your profile and add needs or volunteer opportunities — they&apos;ll appear publicly as soon as you&apos;re approved.</p>
          </div>
        </div>
      )}
      {org.status === "REJECTED" && (
        <div className="mb-6 flex gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800 sm:p-5">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <div>
            <p className="font-semibold">Your organization wasn&apos;t approved</p>
            {org.reviewNote && <p className="mt-1 text-sm">Note from our team: {org.reviewNote}</p>}
            <p className="mt-1 text-sm">Reply to the email we sent if you have questions.</p>
          </div>
        </div>
      )}
      {org.status === "APPROVED" && !org.isPublished && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-slate-800 sm:p-5">
          <EyeOff className="h-5 w-5 shrink-0 text-slate-500" aria-hidden />
          <p className="min-w-0 flex-1 text-sm"><span className="font-semibold">Approved — your page is a draft.</span> It&apos;s hidden from the public until {canPublish ? "you publish it" : "an owner publishes it"}.</p>
          {canPublish && <ActionButton action={setOrgPublishedAction} fields={{ orgId: org.id, publish: "1" }} className="btn-primary btn-sm"><Eye className="h-4 w-4" aria-hidden /> Publish page</ActionButton>}
        </div>
      )}
      {org.status === "APPROVED" && org.isPublished && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900 sm:p-5">
          {org.verifiedAt ? <BadgeCheck className="h-5 w-5 shrink-0 text-brand-600" aria-hidden /> : null}
          <p className="min-w-0 flex-1 text-sm">
            <span className="font-semibold">{org.verifiedAt ? "Approved and verified." : "Approved — your page is live."}</span>{" "}
            {org.verifiedAt ? `Verified on ${formatDate(org.verifiedAt)}.` : "Verification is done by our team after an additional check."}
          </p>
          <Link href={orgHref(org)} className="btn-secondary btn-sm">View public page</Link>
          {canPublish && (
            <ActionButton action={setOrgPublishedAction} fields={{ orgId: org.id, publish: "0" }} confirm={{ title: "Switch your page to draft?", body: "Your page, needs and volunteer opportunities are hidden from the public until you publish again.", confirmLabel: "Switch to draft" }}>
              <EyeOff className="h-4 w-4" aria-hidden /> Switch to draft
            </ActionButton>
          )}
        </div>
      )}
      <div className="mb-6 flex flex-wrap items-center gap-2 text-sm text-slate-600">Status: <OrgStatusBadge status={org.status} />{org.status === "APPROVED" && <PublishBadge published={org.isPublished} />}</div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Open needs" value={openNeeds} href={`${root}needs/`} icon={HandHelping} tone="bg-orange-50 text-sunset-600" />
        <Stat label="Pledges to confirm" value={pendingPledges} href={`${root}needs/`} icon={Inbox} tone="bg-amber-50 text-amber-700" />
        <Stat label="Upcoming opportunities" value={upcomingOpps} href={`${root}volunteer/`} icon={UsersRound} />
        <Stat label="Volunteer sign-ups" value={activeSignups} href={`${root}volunteer/`} icon={UsersRound} tone="bg-emerald-50 text-emerald-700" />
      </div>
      {pendingEvents > 0 && <p className="mt-4 flex items-center gap-2 text-sm text-slate-600"><CalendarDays className="h-4 w-4" aria-hidden /> {pendingEvents} event{pendingEvents === 1 ? "" : "s"} waiting for review.</p>}

      {missing.length > 0 && (
        <Hint className="mt-6">
          <p className="font-semibold">Make your page shine</p>
          <p className="mt-0.5">Add {missing.join(", ").replace(/, ([^,]*)$/, " and $1")} so people know how to help.</p>
          <Link href={`${root}profile/`} className="mt-2 inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline"><PencilLine className="h-4 w-4" aria-hidden /> Edit profile</Link>
        </Hint>
      )}

      <section className="mt-8 grid gap-3 sm:grid-cols-3">
        <Link href={`${root}needs/new/`} className="btn-primary min-h-14 text-base">Post a need</Link>
        <Link href={`${root}volunteer/new/`} className="btn-secondary min-h-14 text-base">Add a volunteer opportunity</Link>
        <Link href={`${root}updates/`} className="btn-secondary min-h-14 text-base">Share an update</Link>
      </section>
      <p className="mt-8 text-center text-sm text-slate-500">T-County Gives is always free for nonprofits, churches and community groups.</p>
    </>
  );
}

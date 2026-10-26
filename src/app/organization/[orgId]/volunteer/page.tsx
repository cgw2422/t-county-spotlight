import Link from "next/link";
import { CalendarClock, MapPin, Plus, UsersRound } from "lucide-react";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import { requireOrgAccess } from "@/lib/gives/access";
import { OPPORTUNITY_STATUS_LABEL } from "@/lib/gives/constants";
import { PageHeader } from "@/components/dashboard/shell";
import { EmptyState } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";
export const metadata = { title: "Volunteer opportunities" };

export default async function OrgVolunteerPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const { org } = await requireOrgAccess(orgId);
  const root = `/organization/${org.id}/`;
  const now = new Date();
  const opps = await db.volunteerOpportunity.findMany({
    where: { organizationId: org.id, deletedAt: null },
    orderBy: [{ startAt: { sort: "desc", nulls: "first" } }],
    include: { signups: { select: { status: true } } },
  });
  const isPast = (o: (typeof opps)[number]) => !o.isOngoing && (o.endAt ?? o.startAt) != null && (o.endAt ?? o.startAt)! < now;
  const current = opps.filter((o) => !isPast(o)).reverse();
  const past = opps.filter(isPast);
  const card = (o: (typeof opps)[number]) => {
    const active = o.signups.filter((s) => s.status === "REGISTERED" || s.status === "CONFIRMED").length;
    const waitlist = o.signups.filter((s) => s.status === "WAITLISTED").length;
    return (
      <li key={o.id}>
        <Link href={`${root}volunteer/${o.id}/`} className="card card-hover block p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className={o.status === "PUBLISHED" ? "badge-green" : "badge-gray"}>{OPPORTUNITY_STATUS_LABEL[o.status]}</span>
            {o.externalSignupUrl && <span className="badge-gray">External sign-up</span>}
          </div>
          <h3 className="mt-2 font-semibold text-navy-900">{o.title}</h3>
          <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
            <span className="inline-flex items-center gap-1"><CalendarClock className="h-4 w-4" aria-hidden />{o.isOngoing ? "Ongoing" : o.startAt ? formatDateTime(o.startAt) : "Date to be announced"}</span>
            {(o.locationName || o.city) && <span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4" aria-hidden />{[o.locationName, o.city].filter(Boolean).join(", ")}</span>}
          </p>
          <p className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-navy-900"><UsersRound className="h-4 w-4" aria-hidden />{active}{o.spots != null ? ` of ${o.spots}` : ""} signed up{waitlist ? ` · ${waitlist} waitlisted` : ""}</p>
        </Link>
      </li>
    );
  };
  return (
    <>
      <PageHeader
        title="Volunteer opportunities"
        description="Post a shift or project. Volunteers sign up on your page, and you manage the list here."
        action={<Link href={`${root}volunteer/new/`} className="btn-primary"><Plus className="h-4 w-4" aria-hidden /> Add opportunity</Link>}
      />
      {opps.length === 0 ? (
        <EmptyState icon={UsersRound} title="No volunteer opportunities yet">
          Need help sorting donations, serving a meal or running an event? Add an opportunity and people can sign up.
          <span className="mt-4 block"><Link href={`${root}volunteer/new/`} className="btn-primary btn-sm">Add your first opportunity</Link></span>
        </EmptyState>
      ) : (
        <div className="space-y-8">
          {current.length > 0 && <ul className="grid gap-3">{current.map(card)}</ul>}
          {past.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">Past</h2>
              <ul className="grid gap-3">{past.map(card)}</ul>
            </section>
          )}
        </div>
      )}
    </>
  );
}

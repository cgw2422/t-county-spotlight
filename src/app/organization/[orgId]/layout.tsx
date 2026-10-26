import { isStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireOrgAccess, getUserOrganizations } from "@/lib/gives/access";
import { orgHref } from "@/lib/gives/constants";
import { OrgShell } from "@/components/gives/org-shell";
import type { OrgNavItem } from "@/components/gives/org-nav";

export const dynamic = "force-dynamic";

export default async function OrgDashboardLayout({ children, params }: { children: React.ReactNode; params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const { user, org, role } = await requireOrgAccess(orgId);
  const [mine, pendingPledges] = await Promise.all([
    getUserOrganizations(user.id),
    db.needPledge.count({ where: { status: "PLEDGED", need: { organizationId: org.id, deletedAt: null } } }),
  ]);
  const orgs = mine.map((o) => ({ id: o.id, name: o.name }));
  if (isStaff(user) && !orgs.some((o) => o.id === org.id)) orgs.unshift({ id: org.id, name: org.name });
  const root = `/organization/${org.id}/`;
  const items: OrgNavItem[] = [
    { key: "overview", href: root, label: "Overview" },
    { key: "profile", href: `${root}profile/`, label: "Edit profile" },
    { key: "needs", href: `${root}needs/`, label: "Needs & wish list", badge: pendingPledges },
    { key: "volunteer", href: `${root}volunteer/`, label: "Volunteer opportunities" },
    { key: "events", href: `${root}events/`, label: "Events" },
    { key: "updates", href: `${root}updates/`, label: "Updates" },
    ...(role === "EDITOR" ? [] : [{ key: "team" as const, href: `${root}team/`, label: "Team" }]),
  ];
  return (
    <OrgShell items={items} root={root} org={{ id: org.id, name: org.name }} orgs={orgs} publicHref={org.status === "APPROVED" && !org.deletedAt ? orgHref(org) : null} userName={user.name || user.email}>
      {children}
    </OrgShell>
  );
}

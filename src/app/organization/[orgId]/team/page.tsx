import { UserMinus } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrgAccess } from "@/lib/gives/access";
import { ORG_ROLES, ORG_ROLE_LABEL } from "@/lib/gives/constants";
import { PageHeader, Panel } from "@/components/dashboard/shell";
import { AddMemberForm } from "@/components/gives/dashboard-forms";
import { ActionButton, ConfirmButton } from "@/components/admin/action-button";
import { changeMemberRoleAction, removeMemberAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Team" };

export default async function OrgTeamPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const { user, org, role, staff } = await requireOrgAccess(orgId, "ADMIN");
  const members = await db.organizationMember.findMany({
    where: { organizationId: org.id },
    include: { user: { select: { id: true, email: true, name: true, passwordHash: true } } },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });
  const owners = members.filter((m) => m.role === "OWNER").length;
  const canOwner = role === "OWNER" || staff;
  return (
    <>
      <PageHeader title="Team" description="People who can help manage your organization's page." />
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <Panel title={`Team members (${members.length})`}>
          <ul className="-mx-1 divide-y divide-slate-100">
            {members.map((m) => {
              const canEdit = canOwner || m.role !== "OWNER";
              return (
                <li key={m.userId} className="px-1 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-navy-900">{m.user.name || m.user.email}{m.userId === user.id && <span className="ml-1 font-normal text-slate-500">(you)</span>}</p>
                      <p className="truncate text-sm text-slate-500">{m.user.email}{!m.user.passwordHash && <span className="badge-amber ml-2">Hasn&apos;t set a password</span>}</p>
                    </div>
                    <span className={m.role === "OWNER" ? "badge-blue" : "badge-gray"}>{ORG_ROLE_LABEL[m.role]}</span>
                  </div>
                  {canEdit && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {ORG_ROLES.filter((r) => r !== m.role && (canOwner || r !== "OWNER")).map((r) => (
                        <ActionButton key={r} action={changeMemberRoleAction} fields={{ orgId: org.id, userId: m.userId, role: r }} className="btn-ghost btn-sm">Make {ORG_ROLE_LABEL[r].toLowerCase()}</ActionButton>
                      ))}
                      {!(m.role === "OWNER" && owners <= 1) && (
                        <ConfirmButton action={removeMemberAction} fields={{ orgId: org.id, userId: m.userId }} title={`Remove ${m.user.email}?`} body="They will no longer be able to manage this organization. Their account is kept." confirmLabel="Remove">
                          <UserMinus className="h-4 w-4" aria-hidden /> Remove
                        </ConfirmButton>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Panel>
        <Panel title="Add a team member"><AddMemberForm orgId={org.id} canAddOwner={canOwner} /></Panel>
      </div>
    </>
  );
}

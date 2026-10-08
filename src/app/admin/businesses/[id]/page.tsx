import { notFound } from "next/navigation";
import Link from "next/link";
import { ExternalLink, UserMinus, Ban, Archive, CheckCircle2, Trash2, Mail } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/utils";
import { businessHref } from "@/lib/links";
import { PageHeader, Card, Notice } from "@/components/admin/page-header";
import { ClientTabs } from "@/components/admin/client-tabs";
import { ActionForm, Submit } from "@/components/admin/action-form";
import { ActionButton, ConfirmButton } from "@/components/admin/action-button";
import { PhotoManager } from "@/components/admin/photo-manager";
import { SearchSelect } from "@/components/admin/search-select";
import { StatusBadge } from "@/components/admin/status-badge";
import { Checkbox, SelectField, TextField } from "@/components/admin/form-field";
import { BusinessForm } from "../business-form";
import { addOwner, grantMembership, removeOwner, revokeMembership, saveBusinessArticles, savePhotos, setBusinessStatus, trashBusiness } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit business" };

export default async function EditBusinessPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string; owner?: string }> }) {
  const user = await requireStaff();
  const isAdmin = user.role === "ADMIN";
  const { id } = await params;
  const { created, owner } = await searchParams;
  const b = await db.business.findUnique({
    where: { id },
    include: {
      categories: { select: { id: true } },
      photos: { orderBy: { sortOrder: "asc" } },
      owners: { include: { user: { select: { id: true, email: true, name: true, passwordHash: true, status: true, lastLoginAt: true } } }, orderBy: { createdAt: "asc" } },
      articles: { include: { article: { select: { id: true, title: true, status: true } } } },
      subscriptions: { include: { plan: { select: { name: true } } }, orderBy: { createdAt: "desc" } },
      _count: { select: { events: true, promotions: true, followers: true } },
    },
  });
  if (!b) notFound();
  const [categories, plans] = await Promise.all([
    db.businessCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
    isAdmin ? db.membershipPlan.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true, isActive: true } }) : [],
  ]);
  const now = new Date();
  const activeSubs = b.subscriptions.filter((s) => ["ACTIVE", "TRIALING"].includes(s.status) && (!s.currentPeriodEnd || s.currentPeriodEnd >= now));

  return (
    <>
      <PageHeader
        title={b.name}
        back={{ href: "/admin/businesses/", label: "Businesses" }}
        eyebrow={<div className="flex flex-wrap gap-1.5"><StatusBadge status={b.status} />{b.isSpotlighted && <span className="badge-blue">Editorial spotlight</span>}{activeSubs[0] && <span className="badge-green">{activeSubs[0].plan.name} member</span>}{b.deletedAt && <span className="badge-red">Deleted</span>}</div>}
        actions={
          <>
            {b.status === "PUBLISHED" && <a href={businessHref(b)} target="_blank" rel="noreferrer" className="btn-secondary btn-sm"><ExternalLink className="h-4 w-4" /> View</a>}
            {b.status !== "PUBLISHED" && <ActionButton action={setBusinessStatus} fields={{ id: b.id, status: "PUBLISHED" }} className="btn-primary btn-sm"><CheckCircle2 className="h-4 w-4" /> Publish</ActionButton>}
            {b.status !== "SUSPENDED" && <ActionButton action={setBusinessStatus} fields={{ id: b.id, status: "SUSPENDED" }} confirm={{ title: `Suspend ${b.name}?`, body: "The listing is hidden from the site and owners lose dashboard access until reactivated.", confirmLabel: "Suspend", danger: true }}><Ban className="h-4 w-4" /> Suspend</ActionButton>}
            {b.status !== "ARCHIVED" && <ActionButton action={setBusinessStatus} fields={{ id: b.id, status: "ARCHIVED" }} confirm={{ title: `Archive ${b.name}?`, body: "Archived businesses are hidden from the site (e.g. closed businesses). You can republish later.", confirmLabel: "Archive" }}><Archive className="h-4 w-4" /> Archive</ActionButton>}
          </>
        }
      />
      {created && <div className="mb-4"><Notice tone="success">Business created. Add photos, owners and linked articles using the tabs below.{owner === "new" && " An owner account was created without a password — the owner must use “Forgot password” on the sign-in page to set one."}</Notice></div>}
      <ClientTabs
        tabs={[
          { id: "details", label: "Details", content: <BusinessForm b={b} categories={categories} selectedCategoryIds={b.categories.map((c) => c.id)} /> },
          {
            id: "photos", label: "Photos", badge: b.photos.length,
            content: (
              <Card title="Photo gallery" description="Drag order matters: the first photo is shown first. Add alt text for accessibility.">
                <ActionForm action={savePhotos}>
                  <input type="hidden" name="id" value={b.id} />
                  <PhotoManager name="photos" defaultValue={b.photos.map((p) => ({ url: p.url, alt: p.alt ?? "", caption: p.caption ?? "" }))} />
                  <div className="mt-4"><Submit pendingText="Saving…">Save gallery</Submit></div>
                </ActionForm>
              </Card>
            ),
          },
          {
            id: "owners", label: "Owners", badge: b.owners.length,
            content: (
              <div className="grid gap-6 lg:grid-cols-2">
                <Card title="Owners & managers" bodyClassName="p-0">
                  {b.owners.length ? (
                    <ul className="divide-y divide-slate-100">
                      {b.owners.map((o) => (
                        <li key={o.userId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
                          <div className="min-w-0">
                            <p className="truncate font-medium text-slate-900">{o.user.name || o.user.email}</p>
                            <p className="truncate text-sm text-slate-500">{o.user.email} · {o.role.toLowerCase()}{!o.user.passwordHash && <span className="badge-amber ml-2">No password set</span>}</p>
                          </div>
                          <div className="flex gap-2">
                            {isAdmin && <Link href={`/admin/users/${o.userId}/`} className="btn-ghost btn-sm">User</Link>}
                            <ConfirmButton action={removeOwner} fields={{ id: b.id, userId: o.userId }} title={`Remove ${o.user.email}?`} body="They will lose access to manage this business. Their account is kept." confirmLabel="Remove">
                              <UserMinus className="h-4 w-4" /> Remove
                            </ConfirmButton>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="px-5 py-6 text-sm text-slate-500">No owners linked yet.</p>}
                </Card>
                <Card title="Add an owner" description="Link an existing account by email, or create one.">
                  <ActionForm action={addOwner} resetOnSuccess className="space-y-3">
                    <input type="hidden" name="id" value={b.id} />
                    <TextField name="email" type="email" label="Email" required placeholder="owner@example.com" />
                    <SelectField name="role" label="Role" options={[{ value: "OWNER", label: "Owner" }, { value: "MANAGER", label: "Manager" }]} />
                    <Checkbox name="notify" label="Email them a notification" defaultChecked />
                    <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">If no account exists, a Business Owner account is created with no password. They must use “Forgot password” on the sign-in page to set one. Members are upgraded to the Business Owner role.</p>
                    <Submit pendingText="Adding…"><Mail className="h-4 w-4" /> Add owner</Submit>
                  </ActionForm>
                </Card>
              </div>
            ),
          },
          {
            id: "articles", label: "Articles", badge: b.articles.length,
            content: (
              <Card title="Linked articles" description="Spotlights and stories that mention this business.">
                <ActionForm action={saveBusinessArticles} className="space-y-4">
                  <input type="hidden" name="id" value={b.id} />
                  <SearchSelect name="articles" type="article" placeholder="Search articles to attach…" initial={b.articles.map((a) => ({ id: a.article.id, label: a.article.title, sub: a.article.status.toLowerCase() }))} />
                  <Submit pendingText="Saving…">Save linked articles</Submit>
                </ActionForm>
              </Card>
            ),
          },
          {
            id: "membership", label: "Membership",
            content: (
              <div className="grid gap-6 lg:grid-cols-2">
                <Card title="Subscriptions" description="Paid features come only from verified subscription records." bodyClassName="p-0">
                  {b.subscriptions.length ? (
                    <ul className="divide-y divide-slate-100">
                      {b.subscriptions.map((s) => {
                        const live = activeSubs.includes(s);
                        return (
                          <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
                            <div>
                              <p className="font-medium text-slate-900">{s.plan.name} <StatusBadge status={live ? s.status : s.status === "ACTIVE" ? "Expired" : s.status} className="ml-1" /></p>
                              <p className="text-sm text-slate-500">{s.source === "manual" ? "Complimentary (admin)" : "Stripe"} · {s.currentPeriodEnd ? `${live ? "Renews/ends" : "Ended"} ${formatDate(s.currentPeriodEnd)}` : "No end date"}</p>
                            </div>
                            {isAdmin && live && s.source === "manual" && (
                              <ConfirmButton action={revokeMembership} fields={{ subscriptionId: s.id }} title="Revoke this complimentary membership?" body="Paid features will be turned off immediately." confirmLabel="Revoke">Revoke</ConfirmButton>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  ) : <p className="px-5 py-6 text-sm text-slate-500">No memberships. This business is on the free listing.</p>}
                </Card>
                {isAdmin ? (
                  <Card title="Grant complimentary membership" description="Creates a manual subscription (no payment).">
                    {plans.length ? (
                      <ActionForm action={grantMembership} resetOnSuccess className="space-y-3">
                        <input type="hidden" name="id" value={b.id} />
                        <SelectField name="planId" label="Plan" required placeholder="Choose a plan…" options={plans.map((p) => ({ value: p.id, label: `${p.name}${p.isActive ? "" : " (inactive)"}` }))} />
                        <TextField name="endsAt" type="datetime-local" label="Ends" help="Leave blank for no end date. Eastern Time." />
                        <Submit pendingText="Granting…">Grant membership</Submit>
                      </ActionForm>
                    ) : <p className="text-sm text-slate-500">Create a membership plan first.</p>}
                  </Card>
                ) : <Notice>Only administrators can grant or revoke memberships.</Notice>}
              </div>
            ),
          },
        ]}
      />
      <div className="mt-8 grid gap-4 text-sm text-slate-500 sm:grid-cols-2">
        <p>{b._count.events} events · {b._count.promotions} specials · {b._count.followers} followers · Updated {formatDateTime(b.updatedAt)}</p>
        {isAdmin && !b.deletedAt && (
          <div className="sm:text-right">
            <ConfirmButton action={trashBusiness} fields={{ id: b.id }} title={`Delete ${b.name}?`} body="The business is removed from the directory and admin lists (soft delete). It can be restored from the “Deleted” filter." confirmLabel="Delete business">
              <Trash2 className="h-4 w-4" /> Delete business
            </ConfirmButton>
          </div>
        )}
      </div>
    </>
  );
}

import { notFound } from "next/navigation";
import { ExternalLink, Ban, Archive, CheckCircle2, Trash2 } from "lucide-react";
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
import { SelectField, TextField } from "@/components/admin/form-field";
import { BusinessForm } from "../business-form";
import { ListingAccessPanel } from "@/components/admin/listing-access-panel";
import { listingAccessRows } from "@/lib/listing-access";
import { getBusinessEntitlements } from "@/lib/entitlements";
import { countListingEvents } from "@/lib/listing-limits";
import { grantMembership, revokeMembership, saveBusinessArticles, savePhotos, setBusinessStatus, trashBusiness } from "../actions";
import { setRecommendationsDisabled } from "../../recommendations/actions";
import { getBusinessSpotlightArticles } from "@/lib/spotlights";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit business" };

export default async function EditBusinessPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string; claimed?: string; owner?: string }> }) {
  const user = await requireStaff();
  const isAdmin = user.role === "ADMIN";
  const { id } = await params;
  const { created, claimed, owner } = await searchParams;
  const b = await db.business.findUnique({
    where: { id },
    include: {
      categories: { select: { id: true } },
      photos: { orderBy: { sortOrder: "asc" } },
      articles: { include: { article: { select: { id: true, title: true, status: true } } } },
      subscriptions: { include: { plan: { select: { name: true } } }, orderBy: { createdAt: "desc" } },
      _count: { select: { events: true, promotions: true, followers: true } },
    },
  });
  if (!b) notFound();
  const [categories, plans, accessRows, { entitlements }, offerings, eventCount, spotlightArticles] = await Promise.all([
    db.businessCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
    isAdmin ? db.membershipPlan.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true, isActive: true } }) : [],
    listingAccessRows({ kind: "business", id }),
    getBusinessEntitlements(id),
    db.businessOfferingSection.findMany({ where: { businessId: id }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], include: { items: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } } }),
    countListingEvents(id),
    getBusinessSpotlightArticles(id),
  ]);
  const spotlighted = spotlightArticles.some((a) => a.live);
  const tierLabel = entitlements.tier === "PREMIUM" ? "Premium" : "Free";
  const now = new Date();
  const activeSubs = b.subscriptions.filter((s) => ["ACTIVE", "TRIALING"].includes(s.status) && (!s.currentPeriodEnd || s.currentPeriodEnd >= now));

  return (
    <>
      <PageHeader
        title={b.name}
        back={{ href: "/admin/businesses/", label: "Businesses" }}
        eyebrow={<div className="flex flex-wrap gap-1.5"><StatusBadge status={b.status} />{spotlighted && <span className="badge-blue">Editorial spotlight</span>}{activeSubs[0] && <span className="badge-green">{activeSubs[0].plan.name} member</span>}{b.deletedAt && <span className="badge-red">Deleted</span>}</div>}
        actions={
          <>
            {b.status === "PUBLISHED" && <a href={businessHref(b)} target="_blank" rel="noreferrer" className="btn-secondary btn-sm"><ExternalLink className="h-4 w-4" /> View</a>}
            {b.status !== "PUBLISHED" && <ActionButton action={setBusinessStatus} fields={{ id: b.id, status: "PUBLISHED" }} className="btn-primary btn-sm"><CheckCircle2 className="h-4 w-4" /> Publish</ActionButton>}
            {b.status !== "SUSPENDED" && <ActionButton action={setBusinessStatus} fields={{ id: b.id, status: "SUSPENDED" }} confirm={{ title: `Suspend ${b.name}?`, body: "The listing is hidden from the site and owners lose dashboard access until reactivated.", confirmLabel: "Suspend", danger: true }}><Ban className="h-4 w-4" /> Suspend</ActionButton>}
            {b.status !== "ARCHIVED" && <ActionButton action={setBusinessStatus} fields={{ id: b.id, status: "ARCHIVED" }} confirm={{ title: `Archive ${b.name}?`, body: "Archived businesses are hidden from the site (e.g. closed businesses). You can republish later.", confirmLabel: "Archive" }}><Archive className="h-4 w-4" /> Archive</ActionButton>}
          </>
        }
      />
      {claimed && <div className="mb-4"><Notice tone="success">Claim approved. The applicant was added as an owner of this existing listing — its content, photos, recommendations and membership were not changed.{owner === "new" && " An owner account was created without a password — use Listing Access → Resend invitation to email them a secure link to set one."}</Notice></div>}
      {created && <div className="mb-4"><Notice tone="success">Business created. Add photos, owners and linked articles using the tabs below.{owner === "new" && " An owner account was created without a password — use Listing Access → Resend invitation to email them a secure link to set one."}</Notice></div>}
      <ClientTabs
        tabs={[
          { id: "details", label: "Details", content: <BusinessForm b={b} categories={categories} selectedCategoryIds={b.categories.map((c) => c.id)} spotlightArticles={spotlightArticles} /> },
          {
            id: "photos", label: "Photos", badge: b.photos.length,
            content: (
              <Card title="Photo gallery" description="Order matters: the owner's primary photo is shown first, then this order. Add alt text for accessibility.">
                <p className="mb-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700" data-testid="admin-photo-counter">
                  <strong>Photos: {b.photos.length} of {entitlements.maxPhotos}</strong> on this listing&apos;s {tierLabel} plan. Staff aren&apos;t limited, but the public profile only shows {entitlements.maxPhotos} photo{entitlements.maxPhotos === 1 ? "" : "s"} while the listing is on this plan (owner&apos;s choices first). Logo and cover don&apos;t count.
                </p>
                <ActionForm action={savePhotos}>
                  <input type="hidden" name="id" value={b.id} />
                  <PhotoManager name="photos" defaultValue={b.photos.map((p) => ({ url: p.url, alt: p.alt ?? "", caption: p.caption ?? "", isPrimary: p.isPrimary }))} />
                  <div className="mt-4"><Submit pendingText="Saving…">Save gallery</Submit></div>
                </ActionForm>
              </Card>
            ),
          },
          {
            id: "services", label: "Services & menus", badge: offerings.length,
            content: (
              <Card title="Services & menus" description={`${entitlements.servicesMenus ? "Shown on the public profile." : "Hidden publicly — this listing isn't on Premium. Data is kept."} Staff can manage them from the owner dashboard (staff override).`}>
                {offerings.length ? (
                  <ul className="space-y-3 text-sm">
                    {offerings.map((s) => (
                      <li key={s.id}><p className="font-medium text-slate-900">{s.title} <span className="badge-gray ml-1">{s.kind === "MENU" ? "Menu" : "Services"}</span></p><p className="text-slate-500">{s.items.length} item{s.items.length === 1 ? "" : "s"}{s.items.length ? `: ${s.items.slice(0, 4).map((i) => i.name).join(", ")}${s.items.length > 4 ? "…" : ""}` : ""}</p></li>
                    ))}
                  </ul>
                ) : <p className="text-sm text-slate-500">No services or menus yet.</p>}
                <a href={`/dashboard/${b.id}/services/`} className="btn-secondary btn-sm mt-4">Manage services &amp; menus</a>
              </Card>
            ),
          },
          {
            id: "owners", label: "Listing Access", badge: accessRows.length,
            content: <ListingAccessPanel kind="business" listingId={b.id} listingName={b.name} rows={accessRows} canManage={isAdmin} linkUsers={isAdmin} />,
          },
          {
            id: "recommendations", label: "Recommendations", badge: b.recommendationCount,
            content: (
              <Card title="Community recommendations" description="Member thumbs-up count (read-only — staff can't add recommendations or edit counts). Membership has no effect.">
                <p className="text-sm text-slate-700"><strong className="tabular-nums">{b.recommendationCount}</strong> recommendation{b.recommendationCount === 1 ? "" : "s"} · {b.recommendationsDisabled ? <span className="badge-amber">Turned off — hidden on the listing</span> : <span className="badge-green">On</span>}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <a href={`/admin/recommendations/${b.id}/`} className="btn-secondary btn-sm">Review recommendations</a>
                  {isAdmin && (b.recommendationsDisabled
                    ? <ActionButton action={setRecommendationsDisabled} fields={{ businessId: b.id, disabled: "0" }} reloadOnSuccess className="btn-primary btn-sm">Turn recommendations on</ActionButton>
                    : <ActionButton action={setRecommendationsDisabled} fields={{ businessId: b.id, disabled: "1" }} reloadOnSuccess prompt={{ name: "reason", label: "Reason (internal, audit log)" }} confirm={{ title: "Turn off recommendations for this listing?", body: "The button and count are hidden on the listing and new recommendations are refused. Existing ones are kept.", confirmLabel: "Turn off", danger: true }}>Turn recommendations off</ActionButton>)}
                </div>
              </Card>
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
                        <TextField id="grant-endsAt" name="endsAt" type="datetime-local" label="Ends" help="Leave blank for no end date. Eastern Time." />
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
        <p>{b._count.events} events ({eventCount} counted toward the {entitlements.maxEvents === null ? "unlimited" : `${entitlements.maxEvents}-event`} plan limit; staff aren&apos;t limited) · {b._count.promotions} specials · {b._count.followers} followers · Updated {formatDateTime(b.updatedAt)}</p>
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

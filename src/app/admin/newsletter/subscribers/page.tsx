import Link from "next/link";
import { Download, Mail, Trash2, UserMinus } from "lucide-react";
import type { Prisma, SubscriberStatus } from "@/generated/prisma/client";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import { SIGNUP_SOURCES, SOURCE_LABELS } from "@/lib/newsletter/copy";
import { PageHeader, Card } from "@/components/admin/page-header";
import { ListToolbar } from "@/components/admin/list-toolbar";
import { DataTable, Pagination } from "@/components/admin/data-table";
import { StatusBadge } from "@/components/admin/status-badge";
import { ActionButton, ConfirmButton } from "@/components/admin/action-button";
import { ActionForm, Submit } from "@/components/admin/action-form";
import { TextField, Checkbox } from "@/components/admin/form-field";
import { EmptyState } from "@/components/ui/empty-state";
import { pageParams, spGet, type SP } from "../../_lib/list";
import { adminUnsubscribeAction, deleteSubscriberAction, inviteSubscriberAction } from "../actions";
import { SUB_STATUSES } from "../labels";
import { subscriberCounts } from "@/lib/newsletter/export";
import { getNewsletterSettings } from "@/lib/newsletter/settings";
import { theName } from "@/lib/newsletter/copy";

export const dynamic = "force-dynamic";
export const metadata = { title: "Newsletter subscribers" };

export default async function SubscribersPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin();
  const sp = await searchParams;
  const q = spGet(sp, "q"), status = spGet(sp, "status"), source = spGet(sp, "source");
  const { page, take, skip, perPage } = pageParams(sp);
  const where: Prisma.NewsletterSubscriberWhereInput = {
    ...(q ? { OR: [{ email: { contains: q, mode: "insensitive" } }, { firstName: { contains: q, mode: "insensitive" } }] } : {}),
    ...((SUB_STATUSES as readonly string[]).includes(status) ? { status: status as SubscriberStatus } : {}),
    ...(source ? { source } : {}),
  };
  const [rows, total, counts, ns] = await Promise.all([
    db.newsletterSubscriber.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
    db.newsletterSubscriber.count({ where }),
    subscriberCounts(),
    getNewsletterSettings(),
  ]);

  return (
    <>
      <PageHeader
        title="Subscribers"
        description="Only people who confirmed their email receive campaigns. You can't add people directly — invite them and they confirm."
        // eslint-disable-next-line @next/next/no-html-link-for-pages -- file download from a route handler
        actions={<a href="/admin/newsletter/subscribers/export/" className="btn-secondary"><Download className="h-4 w-4" /> Export active (CSV)</a>}
      />
      <Card className="mb-6" title="Move to beehiiv" description="Download files for beehiiv's subscriber import. Nothing is emailed and nothing is imported automatically.">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="export-counts">
          <div className="rounded-xl bg-emerald-50 p-3 ring-1 ring-emerald-200"><dt className="text-xs font-medium text-emerald-800">Active (will export)</dt><dd className="text-2xl font-bold tabular-nums text-emerald-900" data-testid="count-active">{counts.active}</dd></div>
          <div className="rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200"><dt className="text-xs font-medium text-amber-800">Pending (not exported)</dt><dd className="text-2xl font-bold tabular-nums text-amber-900" data-testid="count-pending">{counts.pending}</dd></div>
          <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200"><dt className="text-xs font-medium text-slate-700">Unsubscribed</dt><dd className="text-2xl font-bold tabular-nums text-slate-900" data-testid="count-unsubscribed">{counts.unsubscribed}</dd>{counts.bouncedOrComplained > 0 && <dd className="text-xs text-slate-500">+ {counts.bouncedOrComplained} bounced/complained</dd>}</div>
          <div className="rounded-xl bg-red-50 p-3 ring-1 ring-red-200"><dt className="text-xs font-medium text-red-800">Suppressed</dt><dd className="text-2xl font-bold tabular-nums text-red-900" data-testid="count-suppressed">{counts.suppressed}</dd></div>
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- file download from a route handler */}
          <a href="/admin/newsletter/subscribers/export-beehiiv/" className="btn-primary" data-testid="export-beehiiv"><Download className="h-4 w-4" /> Export for beehiiv</a>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- file download from a route handler */}
          <a href="/admin/newsletter/subscribers/export-suppressions/" className="btn-secondary" data-testid="export-suppressions"><Download className="h-4 w-4" /> Export unsubscribes &amp; suppressions</a>
        </div>
        <p className="mt-3 text-xs text-slate-500">“Export for beehiiv” includes only confirmed, active subscribers who never unsubscribed and aren&rsquo;t on the suppression list (matched case-insensitively). Columns: email, first_name, created_at, utm_source, signup_source, community — map the extras to custom fields in beehiiv or skip them. Keep the unsubscribes &amp; suppressions file to make sure those addresses are never imported (beehiiv: Audience → Subscribers → Import, and unsubscribe them there if they already exist).</p>
      </Card>
      <div className="card overflow-hidden">
        <ListToolbar
          placeholder="Search email or name…"
          filters={[
            { name: "status", label: "Status", options: SUB_STATUSES.map((s) => ({ value: s, label: s.charAt(0) + s.slice(1).toLowerCase() })) },
            { name: "source", label: "Source", options: SIGNUP_SOURCES.map((s) => ({ value: s, label: SOURCE_LABELS[s] ?? s })) },
          ]}
        />
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          empty={<EmptyState icon={Mail} title={q || status || source ? "No subscribers match" : "No subscribers yet"}>Signup forms are on the homepage, footer, articles, events and the Explore page.</EmptyState>}
          columns={[
            { header: "Subscriber", primary: true, className: "min-w-[220px]", cell: (r) => (
              <div className="min-w-0">
                <Link href={`/admin/newsletter/subscribers/${r.id}/`} className="block truncate font-semibold text-slate-900 hover:text-brand-700">{r.email}</Link>
                {r.firstName && <span className="text-xs text-slate-500">{r.firstName}</span>}
              </div>
            ) },
            { header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
            { header: "Source", cell: (r) => <span className="text-slate-600">{SOURCE_LABELS[r.source] ?? r.source}</span> },
            { header: "Signed up", cell: (r) => <span className="whitespace-nowrap text-slate-600">{formatDateTime(r.createdAt)}</span>, hideOnMobile: true },
            { header: "Confirmed", cell: (r) => <span className="whitespace-nowrap text-slate-600">{r.confirmedAt ? formatDateTime(r.confirmedAt) : "—"}</span>, hideOnMobile: true },
          ]}
          actions={(r) => (
            <>
              {(r.status === "ACTIVE" || r.status === "PENDING") && (
                <ActionButton action={adminUnsubscribeAction} fields={{ id: r.id }} confirm={{ title: `Unsubscribe ${r.email}?`, body: "They stop receiving the newsletter and are added to the suppression list.", confirmLabel: "Unsubscribe", danger: true }}>
                  <UserMinus className="h-4 w-4" /> Unsubscribe
                </ActionButton>
              )}
              <ConfirmButton action={deleteSubscriberAction} fields={{ id: r.id }} title={`Delete ${r.email}?`} body="Removes the subscriber and their history. The address stays on the suppression list so it's never re-added without new consent.">
                <Trash2 className="h-4 w-4" /><span className="sr-only">Delete</span>
              </ConfirmButton>
            </>
          )}
        />
        <Pagination total={total} page={page} perPage={perPage} basePath="/admin/newsletter/subscribers/" params={sp} />
      </div>

      <Card className="mt-6" title="Invite someone" description="For people who asked you in person or by email to get the newsletter. We send them a confirmation link — they're subscribed only after they click it.">
        <ActionForm action={inviteSubscriberAction} resetOnSuccess className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <TextField name="email" type="email" label="Email" required maxLength={254} />
          <TextField name="firstName" label="First name (optional)" maxLength={80} />
          <Submit pendingText="Sending…">Send invitation</Submit>
          <div className="sm:col-span-3"><Checkbox name="confirmPermission" label={`This person asked to receive ${theName(ns.name)}`} help="Never invite imported business contacts or people who haven't asked." /></div>
        </ActionForm>
      </Card>
    </>
  );
}

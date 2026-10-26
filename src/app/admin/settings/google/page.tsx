import Link from "next/link";
import { BadgeCheck, Building2, CheckCircle2, MapPin, XCircle } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { getGooglePlacesSettings, isApiKeyConfigured, MAX_CACHE_MINUTES } from "@/lib/google-places";
import { PageHeader, Card, Notice } from "@/components/admin/page-header";
import { ActionForm, Submit } from "@/components/admin/action-form";
import { Checkbox, FormGrid, TextField } from "@/components/admin/form-field";
import { StatCard } from "@/components/admin/stat-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { saveGoogleSettings } from "./actions";
import { TestLookupForm } from "./test-lookup";

export const dynamic = "force-dynamic";
export const metadata = { title: "Google reviews" };

export default async function GoogleSettingsPage() {
  await requireAdmin();
  const keyOk = isApiKeyConfigured();
  const notDeleted = { deletedAt: null };
  const [s, total, linked, verified, optedOut, missing, missingCount] = await Promise.all([
    getGooglePlacesSettings(),
    db.business.count({ where: notDeleted }),
    db.business.count({ where: { ...notDeleted, googlePlaceId: { not: null } } }),
    db.business.count({ where: { ...notDeleted, googlePlaceId: { not: null }, googlePlaceVerifiedAt: { not: null } } }),
    db.business.count({ where: { ...notDeleted, OR: [{ googlePlaceId: { not: null } }, { googleMapsUrl: { not: null } }], googleReviewsEnabled: false } }),
    db.business.findMany({ where: { ...notDeleted, googlePlaceId: null }, orderBy: [{ status: "asc" }, { name: "asc" }], take: 100, select: { id: true, name: true, city: true, status: true, googleMapsUrl: true } }),
    db.business.count({ where: { ...notDeleted, googlePlaceId: null } }),
  ]);
  const live = keyOk && s.enabled;

  return (
    <>
      <PageHeader
        title="Google reviews"
        back={{ href: "/admin/settings/", label: "Settings" }}
        description="Link businesses to their Google Maps listings and optionally show live Google ratings and reviews on public profiles."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Businesses" value={total} icon={Building2} tone="navy" />
        <StatCard label="With a Place ID" value={linked} icon={MapPin} tone="blue" />
        <StatCard label="Verified with Google" value={verified} icon={BadgeCheck} tone="green" />
        <StatCard label="Reviews card turned off" value={optedOut} icon={XCircle} tone="amber" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          <Card title="API status">
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2">
                {keyOk ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-slate-400" />}
                <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">GOOGLE_PLACES_API_KEY</code>
                <span className={keyOk ? "text-emerald-700" : "text-slate-500"}>{keyOk ? "configured" : "not set"}</span>
              </li>
              <li className="flex items-center gap-2">
                {live ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-slate-400" />}
                <span>{live ? "Live ratings & reviews are on." : "Live data is off — profiles show a “Read Reviews on Google” link only."}</span>
              </li>
            </ul>
            <p className="help mt-3">The key is read from the server environment only. It is never stored in the database or sent to browsers.</p>
          </Card>

          <Card title="Display settings">
            <ActionForm action={saveGoogleSettings} warnUnsaved className="space-y-4">
              <Checkbox name="enabled" label="Enable Google Places API" defaultChecked={s.enabled} help="Live ratings/reviews, business search in editors and Place ID verification. Requires the API key." />
              <Checkbox name="showReviews" label="Show individual reviews" defaultChecked={s.showReviews} help="When off, profiles show the rating summary and link only." />
              <FormGrid>
                <TextField name="maxReviews" type="number" min={1} max={5} label="Reviews per profile" defaultValue={s.maxReviews} help="1–5. Google returns at most five, in its own order." />
                <TextField name="cacheMinutes" type="number" min={0} max={MAX_CACHE_MINUTES} label="Cache minutes" defaultValue={s.cacheMinutes} help="Temporary in-memory cache only. 0 disables caching." />
              </FormGrid>
              <Submit pendingText="Saving…">Save settings</Submit>
            </ActionForm>
          </Card>

          <Card title="Test lookup" description="Fetch Place Details (New) for a Place ID. Nothing is saved.">
            <TestLookupForm disabled={!keyOk} />
          </Card>

          <Card title={`Businesses without a Place ID (${missingCount})`} description="Open a business to link it to Google." bodyClassName="p-0">
            {missing.length ? (
              <ul className="divide-y divide-slate-100">
                {missing.map((b) => (
                  <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 sm:px-5">
                    <div className="min-w-0">
                      <Link href={`/admin/businesses/${b.id}/`} className="font-medium text-slate-900 hover:text-brand-700 hover:underline">{b.name}</Link>
                      <p className="text-xs text-slate-500">{b.city ?? "No city"}{b.googleMapsUrl && " · has Maps link"}</p>
                    </div>
                    <StatusBadge status={b.status} />
                  </li>
                ))}
              </ul>
            ) : <p className="px-5 py-6 text-sm text-slate-500">Every business has a Place ID.</p>}
            {missingCount > missing.length && <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">Showing the first {missing.length}.</p>}
          </Card>
        </div>

        <aside className="min-w-0 space-y-6">
          <Card title="Set up the API key">
            <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
              <li>In the <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer" className="text-brand-700 underline">Google Cloud console</a>, create (or pick) a project and attach a billing account.</li>
              <li>Under <em>APIs &amp; Services → Library</em>, enable <strong>Places API (New)</strong>.</li>
              <li>Under <em>Credentials</em>, create an API key. Restrict it to <strong>Places API (New)</strong> only, and set application restrictions to your server&rsquo;s IP addresses (no HTTP-referrer/browser use — this key is server-only).</li>
              <li>Set billing budgets and alerts in <em>Billing → Budgets &amp; alerts</em>, and consider per-day quotas for the Places API.</li>
              <li>Add the key to the server environment as <code className="rounded bg-slate-100 px-1 text-xs">GOOGLE_PLACES_API_KEY</code> and redeploy.</li>
            </ol>
          </Card>
          <Notice title="Google Maps Platform policies">
            Only Place IDs are stored. Ratings and reviews are fetched live and cached in memory for at most the minutes set above. Reviews are shown unedited, in Google&rsquo;s order, with author and Google Maps attribution, and are never added to our structured data.
          </Notice>
        </aside>
      </div>
    </>
  );
}

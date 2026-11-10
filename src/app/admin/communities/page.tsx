import Link from "next/link";
import { ExternalLink, ImageIcon, MapPin, Pencil } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import { COMMUNITIES, getCommunityCounts, hasCommunityContent } from "@/lib/communities";
import { PageHeader } from "@/components/admin/page-header";
import { DataTable } from "@/components/admin/data-table";

export const dynamic = "force-dynamic";
export const metadata = { title: "Community pages" };

export default async function AdminCommunitiesPage() {
  await requireStaff();
  const [profiles, counts] = await Promise.all([db.communityProfile.findMany(), getCommunityCounts()]);
  const bySlug = new Map(profiles.map((p) => [p.slug, p]));
  const rows = COMMUNITIES.map((c) => ({ ...c, profile: bySlug.get(c.slug) ?? null, counts: counts.get(c.slug)! }));
  return (
    <>
      <PageHeader
        title="Community pages"
        description="Each community page fills itself from events, businesses, organizations and articles tagged with that town. Here you can add an optional cover photo and a short introduction."
      />
      <div className="card overflow-hidden">
        <DataTable
          rows={rows}
          rowKey={(r) => r.slug}
          columns={[
            {
              header: "Community", primary: true, className: "min-w-[200px]",
              cell: (r) => (
                <div>
                  <Link href={`/admin/communities/${r.slug}/`} className="font-semibold text-slate-900 hover:text-brand-700">{r.name}</Link>
                  <p className="text-xs text-slate-500">/communities/{r.slug}/</p>
                </div>
              ),
            },
            {
              header: "Admin content",
              cell: (r) => (
                <span className="flex flex-wrap gap-1.5 text-xs">
                  {r.profile?.coverImageUrl && <span className="badge-green"><ImageIcon className="h-3 w-3" aria-hidden /> Cover</span>}
                  {r.profile?.intro && <span className="badge-green">Intro</span>}
                  {!r.profile?.coverImageUrl && !r.profile?.intro && <span className="text-slate-400">—</span>}
                </span>
              ),
            },
            {
              header: "Listed content",
              cell: (r) => (
                <span className="text-xs text-slate-600">
                  {hasCommunityContent(r.counts)
                    ? [r.counts.events && `${r.counts.events} events`, r.counts.businesses && `${r.counts.businesses} businesses`, r.counts.organizations && `${r.counts.organizations} organizations`, r.counts.articles && `${r.counts.articles} articles`, r.counts.sales && `${r.counts.sales} sales`, r.counts.stops && `${r.counts.stops} truck stops`].filter(Boolean).join(" · ")
                    : <span className="text-slate-400">Nothing listed yet</span>}
                </span>
              ),
              hideOnMobile: true,
            },
            { header: "Updated", cell: (r) => <span className="whitespace-nowrap text-slate-600">{r.profile ? formatDate(r.profile.updatedAt, { month: "short", day: "numeric", year: "numeric" }) : "—"}</span>, hideOnMobile: true },
          ]}
          actions={(r) => (
            <>
              <Link href={`/admin/communities/${r.slug}/`} className="btn-secondary btn-sm"><Pencil className="h-4 w-4" /> Edit</Link>
              <a href={`/communities/${r.slug}/`} target="_blank" rel="noreferrer" className="btn-ghost btn-sm" aria-label={`View ${r.name} page`}><ExternalLink className="h-4 w-4" /></a>
            </>
          )}
        />
      </div>
      <p className="mt-4 flex items-center gap-1.5 text-sm text-slate-600"><MapPin className="h-4 w-4" aria-hidden /> Tag articles to a community with the “Community” field in the article editor.</p>
    </>
  );
}

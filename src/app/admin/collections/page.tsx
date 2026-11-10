import Link from "next/link";
import { Compass, Eye, EyeOff, Lightbulb, Pencil, Plus, Rocket, Star, Trash2 } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import { SUGGESTED_COLLECTIONS, collectionHref, collectionItemSelect, resolveCollectionItems, type CollectionItemRow } from "@/lib/explore-collections";
import { PageHeader, Card } from "@/components/admin/page-header";
import { DataTable } from "@/components/admin/data-table";
import { StatusBadge } from "@/components/admin/status-badge";
import { ActionButton, ConfirmButton } from "@/components/admin/action-button";
import { EmptyState } from "@/components/ui/empty-state";
import { deleteCollection, setCollectionStatus, startSuggestedCollection } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Explore collections" };

const short = { month: "short", day: "numeric", year: "numeric" } as const;

export default async function CollectionsPage() {
  await requireStaff();
  const rows = await db.exploreCollection.findMany({
    orderBy: [{ isFeatured: "desc" }, { sortOrder: "asc" }, { title: "asc" }],
    include: { items: { select: collectionItemSelect } },
  });
  const visible = await Promise.all(rows.map((r) => resolveCollectionItems(r.items as CollectionItemRow[]).then((x) => x.length)));
  const data = rows.map((r, i) => ({ ...r, total: r.items.length, visible: visible[i] }));
  const titles = new Set(rows.map((r) => r.title.toLowerCase()));
  const suggestions = SUGGESTED_COLLECTIONS.map((s, index) => ({ ...s, index })).filter((s) => !titles.has(s.title.toLowerCase()));

  return (
    <>
      <PageHeader
        title="Explore collections"
        description="Curated lists of places, businesses, events and stories shown on Explore T County. Only published collections with at least one visible item appear on the site."
        actions={<Link href="/admin/collections/new/" className="btn-primary"><Plus className="h-4 w-4" /> New collection</Link>}
      />
      <div className="card mb-6 overflow-hidden">
        <DataTable
          rows={data}
          rowKey={(r) => r.id}
          empty={<EmptyState icon={Compass} title="No collections yet">Create one, or start from a suggestion below.</EmptyState>}
          columns={[
            {
              header: "Collection", primary: true, className: "min-w-[240px]",
              cell: (r) => (
                <div className="min-w-0">
                  <Link href={`/admin/collections/${r.id}/`} className="font-semibold text-slate-900 hover:text-brand-700">{r.title}</Link>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                    {r.isFeatured && <span className="inline-flex items-center gap-1 font-semibold text-amber-700"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" aria-hidden /> Featured</span>}
                    <span>/explore/{r.slug}/</span>
                  </div>
                </div>
              ),
            },
            { header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
            {
              header: "Items",
              cell: (r) => (
                <span className="tabular-nums text-slate-600" data-testid="collection-item-counts">
                  {r.visible} visible{r.total !== r.visible ? ` · ${r.total - r.visible} hidden` : ""}
                </span>
              ),
            },
            { header: "Order", cell: (r) => <span className="tabular-nums text-slate-600">{r.sortOrder}</span>, hideOnMobile: true, align: "right" },
            { header: "Updated", cell: (r) => <span className="whitespace-nowrap text-slate-600">{formatDate(r.updatedAt, short)}</span>, hideOnMobile: true },
          ]}
          actions={(r) => (
            <>
              <Link href={`/admin/collections/${r.id}/`} className="btn-secondary btn-sm"><Pencil className="h-4 w-4" /> Edit</Link>
              {(r.status === "PUBLISHED" && r.visible > 0) || r.status !== "PUBLISHED" ? (
                <a href={collectionHref(r)} target="_blank" rel="noreferrer" className="btn-ghost btn-sm" aria-label={`View ${r.title}`}><Eye className="h-4 w-4" /></a>
              ) : null}
              {r.status === "PUBLISHED" ? (
                <ActionButton action={setCollectionStatus} fields={{ id: r.id, intent: "unpublish" }} className="btn-ghost btn-sm" title="Unpublish"><EyeOff className="h-4 w-4" /><span className="sr-only">Unpublish</span></ActionButton>
              ) : (
                <ActionButton action={setCollectionStatus} fields={{ id: r.id, intent: "publish" }} className="btn-ghost btn-sm" title="Publish"><Rocket className="h-4 w-4" /><span className="sr-only">Publish</span></ActionButton>
              )}
              <ConfirmButton action={deleteCollection} fields={{ id: r.id }} title="Delete this collection?" confirmLabel="Delete" body={<>“{r.title}” and its {r.total} {r.total === 1 ? "item" : "items"} will be permanently deleted. Linked businesses, events and articles are not affected.</>} className="btn-ghost btn-sm text-red-700 hover:bg-red-50">
                <Trash2 className="h-4 w-4" /><span className="sr-only">Delete</span>
              </ConfirmButton>
            </>
          )}
        />
      </div>

      {suggestions.length > 0 && (
        <Card title={<span className="inline-flex items-center gap-2"><Lightbulb className="h-4 w-4 text-amber-500" aria-hidden /> Start from a suggestion</span>} description="Creates an empty draft with this title and description. Add real items (with authentic photos and verified details) before publishing.">
          <ul className="grid gap-3 sm:grid-cols-2">
            {suggestions.map((s) => (
              <li key={s.index} className="flex flex-col gap-2 rounded-xl border border-slate-200 p-4">
                <p className="font-semibold text-slate-900">{s.title}</p>
                <p className="text-sm text-slate-600">{s.description}</p>
                <div className="mt-auto pt-1">
                  <ActionButton action={startSuggestedCollection} fields={{ index: String(s.index) }} className="btn-secondary btn-sm">
                    <Plus className="h-4 w-4" /> Start as empty draft
                  </ActionButton>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

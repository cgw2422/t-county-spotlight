import { notFound } from "next/navigation";
import { ChevronDown, ChevronUp, ExternalLink, Eye, Trash2 } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { ITEM_TYPE_LABEL, collectionHref, collectionItemSelect, resolveCollectionItems, type CollectionItemRow } from "@/lib/explore-collections";
import { PageHeader, Card, Notice } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { ActionButton, ConfirmButton } from "@/components/admin/action-button";
import { CollectionForm } from "../collection-form";
import { AddItemPanel, ItemEditForm } from "../items-manager";
import { moveItem, removeItem } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit collection" };

/** Admin labels for linked records, whatever their status (so hidden items can still be identified). */
async function linkedLabels(items: CollectionItemRow[]) {
  const ids = (t: string) => items.filter((i) => i.itemType === t && i.targetId).map((i) => i.targetId!);
  const [b, a, e, o, p] = await Promise.all([
    db.business.findMany({ where: { id: { in: ids("BUSINESS") } }, select: { id: true, name: true, city: true } }),
    db.article.findMany({ where: { id: { in: ids("ARTICLE") } }, select: { id: true, title: true, city: true } }),
    db.event.findMany({ where: { id: { in: ids("EVENT") } }, select: { id: true, title: true, city: true } }),
    db.organization.findMany({ where: { id: { in: ids("ORGANIZATION") } }, select: { id: true, name: true, city: true } }),
    db.communityPulse.findMany({ where: { id: { in: ids("PULSE") } }, select: { id: true, title: true } }),
  ]);
  const m = new Map<string, { label: string; city: string | null }>();
  b.forEach((x) => m.set(`BUSINESS:${x.id}`, { label: x.name, city: x.city }));
  a.forEach((x) => m.set(`ARTICLE:${x.id}`, { label: x.title, city: x.city }));
  e.forEach((x) => m.set(`EVENT:${x.id}`, { label: x.title, city: x.city }));
  o.forEach((x) => m.set(`ORGANIZATION:${x.id}`, { label: x.name, city: x.city }));
  p.forEach((x) => m.set(`PULSE:${x.id}`, { label: x.title, city: null }));
  return m;
}

export default async function EditCollectionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  await requireStaff();
  const { id } = await params;
  const { created } = await searchParams;
  const c = await db.exploreCollection.findUnique({ where: { id }, include: { items: { select: collectionItemSelect, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } } });
  if (!c) notFound();
  const items = c.items as CollectionItemRow[];
  const [resolved, labels] = await Promise.all([resolveCollectionItems(items), linkedLabels(items)]);
  const visibleIds = new Set(resolved.map((r) => r.itemId));
  const published = c.status === "PUBLISHED";

  return (
    <>
      <PageHeader
        title={c.title}
        eyebrow={<StatusBadge status={c.status} />}
        back={{ href: "/admin/collections/", label: "Explore collections" }}
        actions={
          resolved.length > 0 || !published ? (
            <a href={collectionHref(c)} target="_blank" rel="noreferrer" className="btn-secondary btn-sm">
              {published ? <><ExternalLink className="h-4 w-4" /> View live</> : <><Eye className="h-4 w-4" /> Preview</>}
            </a>
          ) : null
        }
      />
      {created && <div className="mb-4"><Notice tone="success">Collection created as a draft. Add items below, then publish.</Notice></div>}
      {published && resolved.length === 0 && <div className="mb-4"><Notice tone="warn">This collection has no publicly visible items, so it is hidden from the site.</Notice></div>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <CollectionForm
            key={`${c.id}-${c.updatedAt.getTime()}`}
            c={{
              id: c.id, title: c.title, slug: c.slug, description: c.description ?? "", coverImageUrl: c.coverImageUrl ?? "", coverFocusX: c.coverFocusX, coverFocusY: c.coverFocusY,
              isFeatured: c.isFeatured, sortOrder: c.sortOrder, status: c.status, visibleCount: resolved.length,
            }}
          />
        </div>

        <div className="space-y-6">
          <Card title={`Items (${items.length})`} description={`${resolved.length} visible on the site. Items that are unpublished, deleted or past are hidden automatically.`}>
            {items.length === 0 ? (
              <p className="text-sm text-slate-600" data-testid="no-items">No items yet. Add a place or link an existing listing below.</p>
            ) : (
              <ol className="space-y-2" data-testid="admin-items">
                {items.map((it, i) => {
                  const linked = it.targetId ? labels.get(`${it.itemType}:${it.targetId}`) : null;
                  const label = it.itemType === "PLACE" ? it.title : it.title || linked?.label || "(record no longer exists)";
                  const city = it.itemType === "PLACE" ? it.city : linked?.city;
                  const visible = visibleIds.has(it.id);
                  return (
                    <li key={it.id} className="rounded-xl border border-slate-200 bg-white" data-testid="admin-item">
                      <div className="flex flex-wrap items-center gap-2 p-3">
                        <span className="w-6 text-center text-xs font-semibold text-slate-400">{i + 1}</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-slate-900">{label}</p>
                          <p className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                            <span className="badge-gray">{ITEM_TYPE_LABEL[it.itemType]}</span>
                            {city && <span>{city}</span>}
                            {!visible && <span className="badge-amber">Hidden: not public{it.itemType === "EVENT" ? " or past" : ""}</span>}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          {i > 0 ? <ActionButton action={moveItem} fields={{ id: it.id, dir: "up" }} className="btn-ghost btn-sm" title="Move up"><ChevronUp className="h-4 w-4" /><span className="sr-only">Move {label} up</span></ActionButton> : <span className="inline-block w-9" aria-hidden />}
                          {i < items.length - 1 ? <ActionButton action={moveItem} fields={{ id: it.id, dir: "down" }} className="btn-ghost btn-sm" title="Move down"><ChevronDown className="h-4 w-4" /><span className="sr-only">Move {label} down</span></ActionButton> : <span className="inline-block w-9" aria-hidden />}
                          <ConfirmButton action={removeItem} fields={{ id: it.id }} title="Remove this item?" confirmLabel="Remove" body={<>“{label}” will be removed from this collection. {it.itemType === "PLACE" ? "Its details will be deleted." : "The listing itself is not affected."}</>} className="btn-ghost btn-sm text-red-700 hover:bg-red-50">
                            <Trash2 className="h-4 w-4" /><span className="sr-only">Remove {label}</span>
                          </ConfirmButton>
                        </div>
                      </div>
                      <details className="border-t border-slate-100 px-3 py-2">
                        <summary className="min-h-9 cursor-pointer py-1.5 text-sm font-semibold text-brand-700">Edit {it.itemType === "PLACE" ? "place details" : "display details"}</summary>
                        <div className="pb-2 pt-3">
                          <ItemEditForm key={`${it.id}-${it.sortOrder}`} id={it.id} itemType={it.itemType} v={it} />
                        </div>
                      </details>
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>

          <Card title="Add an item" description="Add a park, trail or historic site as a place, or link a published business, event, article, nonprofit/church or Community Pulse entry.">
            <AddItemPanel collectionId={c.id} existing={items.filter((x) => x.targetId).map((x) => `${x.itemType}:${x.targetId}`)} />
          </Card>
        </div>
      </div>
    </>
  );
}

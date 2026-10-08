import { Sparkles, Trash2 } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { formatDate, toDateInput } from "@/lib/utils";
import { PageHeader, Card, Notice } from "@/components/admin/page-header";
import { ActionForm, Submit } from "@/components/admin/action-form";
import { ConfirmButton } from "@/components/admin/action-button";
import { Checkbox, FormGrid, SelectField, TextField } from "@/components/admin/form-field";
import { SearchSelect } from "@/components/admin/search-select";
import { MediaField } from "@/components/admin/media-picker";
import { StatusBadge } from "@/components/admin/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import type { Placement } from "@/generated/prisma/client";
import { deletePlacement, savePlacement } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sponsored placements" };

function PlacementFields({ p, slots, products, business }: { p?: Placement; slots: { value: string; label: string }[]; products: { value: string; label: string }[]; business?: { id: string; label: string } | null }) {
  return (
    <div className="space-y-4">
      {p && <input type="hidden" name="id" value={p.id} />}
      <FormGrid>
        <SelectField name="slot" label="Slot" required defaultValue={p?.slot ?? "homepage_featured"} options={slots} />
        <SelectField name="productId" label="Sponsorship product" defaultValue={p?.productId ?? ""} placeholder="None / custom deal" options={products} />
      </FormGrid>
      <SearchSelect name="business" type="business" multiple={false} label="Sponsoring business" initial={business ? [business] : []} placeholder="Search businesses…" />
      <FormGrid>
        <TextField name="title" label="Title (optional)" defaultValue={p?.title ?? ""} help="Used when there's no business, e.g. a community sponsor." />
        <TextField name="linkUrl" label="Link (optional)" defaultValue={p?.linkUrl ?? ""} placeholder="https://" />
        <TextField name="startsAt" type="datetime-local" label="Starts" defaultValue={toDateInput(p?.startsAt ?? new Date())} />
        <TextField name="endsAt" type="datetime-local" label="Ends" defaultValue={toDateInput(p?.endsAt)} />
      </FormGrid>
      <MediaField name="imageUrl" label="Image (optional)" defaultValue={p?.imageUrl} className="max-w-sm" />
      <Checkbox name="isActive" label="Active" defaultChecked={p ? p.isActive : true} />
    </div>
  );
}

export default async function PlacementsPage() {
  await requireStaff();
  const [rows, categories, products, settings] = await Promise.all([
    db.placement.findMany({ orderBy: [{ isActive: "desc" }, { startsAt: "desc" }], include: { business: { select: { id: true, name: true } }, product: { select: { name: true } } } }),
    db.businessCategory.findMany({ orderBy: { sortOrder: "asc" }, select: { slug: true, name: true } }),
    db.sponsorshipProduct.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    getSettings(),
  ]);
  const slots = [
    { value: "homepage_featured", label: "Homepage — featured businesses" },
    { value: "weekend_guide", label: "Weekend guide sponsor" },
    { value: "events", label: "Events page" },
    ...categories.map((c) => ({ value: `category:${c.slug}`, label: `Category — ${c.name}` })),
  ];
  const slotLabel = (s: string) => slots.find((x) => x.value === s)?.label ?? s;
  const productOpts = products.map((p) => ({ value: p.id, label: p.name }));
  const now = new Date();
  return (
    <>
      <PageHeader title="Sponsored placements" back={{ href: "/admin/homepage/", label: "Homepage" }} description="Paid placements. Every placement is shown on the site with the sponsored label." />
      <div className="mb-6"><Notice tone="warn" title={`Always labeled “${settings.sponsoredLabel}”`}>Sponsored placements are advertising. They never grant an editorial spotlight — that stays an editorial decision on the business record.</Notice></div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card title="Placements" bodyClassName="p-0">
          {rows.length ? (
            <ul className="divide-y divide-slate-100">
              {rows.map((p) => {
                const live = p.isActive && p.startsAt <= now && (!p.endsAt || p.endsAt >= now);
                const state = !p.isActive ? "Hidden" : p.endsAt && p.endsAt < now ? "Expired" : p.startsAt > now ? "Scheduled" : "Active";
                return (
                  <li key={p.id} className="px-4 py-3 sm:px-5">
                    <details className="group">
                      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2 font-semibold text-slate-900"><span className="badge-sponsored">{settings.sponsoredLabel}</span>{p.business?.name || p.title || "Untitled"}</span>
                          <span className="block text-xs text-slate-500">{slotLabel(p.slot)} · {formatDate(p.startsAt, { month: "short", day: "numeric", year: "numeric" })} – {p.endsAt ? formatDate(p.endsAt, { month: "short", day: "numeric", year: "numeric" }) : "no end"}{p.product ? ` · ${p.product.name}` : ""}</span>
                        </span>
                        <StatusBadge status={state} label={live ? "Live" : undefined} />
                        <span className="text-sm font-semibold text-brand-700 group-open:hidden">Edit</span>
                      </summary>
                      <ActionForm action={savePlacement} className="mt-4 rounded-xl bg-slate-50 p-4">
                        <PlacementFields p={p} slots={slots} products={productOpts} business={p.business ? { id: p.business.id, label: p.business.name } : null} />
                        <div className="mt-4 flex flex-wrap gap-2">
                          <Submit className="btn-primary btn-sm" pendingText="Saving…">Save</Submit>
                          <ConfirmButton action={deletePlacement} fields={{ id: p.id }} title="Delete this placement?"><Trash2 className="h-4 w-4" /> Delete</ConfirmButton>
                        </div>
                      </ActionForm>
                    </details>
                  </li>
                );
              })}
            </ul>
          ) : <div className="p-5"><EmptyState icon={Sparkles} title="No sponsored placements">Add one when a business purchases a featured spot.</EmptyState></div>}
        </Card>
        <Card title="Add placement" className="xl:self-start">
          <ActionForm action={savePlacement} resetOnSuccess>
            <PlacementFields slots={slots} products={productOpts} />
            <Submit className="btn-primary mt-4" pendingText="Adding…">Add placement</Submit>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}

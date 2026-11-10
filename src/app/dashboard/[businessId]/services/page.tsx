import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDown, ArrowUp, ListChecks, Lock, Pencil, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { isStaff, requireBusinessAccess } from "@/lib/auth";
import { getBusinessEntitlements } from "@/lib/entitlements";
import { PageHeader, Panel } from "@/components/dashboard/shell";
import { ConfirmSubmit } from "@/components/dashboard/confirm-submit";
import { ItemForm, SectionForm } from "@/components/dashboard/services-forms";
import { EmptyState } from "@/components/ui/empty-state";
import { deleteItemAction, deleteSectionAction, moveItemAction, moveSectionAction } from "./actions";

export const metadata: Metadata = { title: "Services & menus" };
export const dynamic = "force-dynamic";

const KIND_LABEL = { SERVICES: "Services", MENU: "Menu" } as const;

function MoveButtons({ action, fields, first, last }: { action: (fd: FormData) => Promise<void>; fields: Record<string, string>; first: boolean; last: boolean }) {
  return (
    <form action={action} className="flex">
      {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <button name="dir" value="up" disabled={first} className="btn-ghost px-2.5 disabled:opacity-30" aria-label="Move up"><ArrowUp className="h-4 w-4" /></button>
      <button name="dir" value="down" disabled={last} className="btn-ghost px-2.5 disabled:opacity-30" aria-label="Move down"><ArrowDown className="h-4 w-4" /></button>
    </form>
  );
}

export default async function ServicesPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const { user, business } = await requireBusinessAccess(businessId);
  const [{ entitlements }, sections] = await Promise.all([
    getBusinessEntitlements(business.id),
    db.businessOfferingSection.findMany({
      where: { businessId: business.id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: { items: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } },
    }),
  ]);
  const entitled = entitlements.servicesMenus;
  const editable = entitled || isStaff(user);
  const membership = `/dashboard/${business.id}/membership/`;

  return (
    <>
      <PageHeader title="Services & menus" description="List what you offer — services with pricing, or your menu — right on your listing." />

      {!entitled && (
        <div className="card mb-6 overflow-hidden" data-testid="services-upgrade">
          <div className="flex flex-col gap-4 bg-gradient-to-br from-navy-800 to-brand-700 p-6 text-white sm:flex-row sm:items-center sm:p-7">
            <Lock className="h-8 w-8 shrink-0 text-sunset-400" aria-hidden />
            <div className="flex-1">
              <p className="font-display text-xl font-semibold">Upgrade to Premium to showcase detailed services, pricing, and menus.</p>
              {sections.length > 0 && <p className="mt-1 text-sm text-slate-200">Your saved services and menus are kept, but they&apos;re hidden on your public listing until Premium returns.</p>}
            </div>
            <Link href={membership} className="btn-accent shrink-0">See Premium</Link>
          </div>
        </div>
      )}
      {!entitled && editable && <p className="mb-6 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Staff override: you can edit this listing&apos;s services and menus, but they only display publicly with Premium.</p>}

      <div className="space-y-6">
        {sections.length === 0 && (
          <EmptyState icon={ListChecks} title="No services or menus yet">
            {entitled ? "Add your first section — for example “Services” or “Lunch menu” — then list items with optional prices." : "With Premium you can list services with pricing or share your full menu."}
          </EmptyState>
        )}

        {sections.map((s, si) => (
          <section key={s.id} className="card p-5 sm:p-6" data-testid="offering-section">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="badge-gray">{KIND_LABEL[s.kind]}</span>
                <h2 className="mt-1 text-lg font-semibold text-navy-900">{s.title}</h2>
                {s.description && <p className="mt-0.5 text-sm text-slate-600">{s.description}</p>}
              </div>
              {editable && (
                <div className="flex items-center gap-1">
                  <MoveButtons action={moveSectionAction} fields={{ businessId: business.id, sectionId: s.id }} first={si === 0} last={si === sections.length - 1} />
                  <ConfirmSubmit action={deleteSectionAction} fields={{ businessId: business.id, sectionId: s.id }} title={`Delete “${s.title}”?`}
                    body={`This deletes the section and its ${s.items.length} item${s.items.length === 1 ? "" : "s"}.`} confirmLabel="Delete section" className="btn-ghost px-2.5 text-red-600 hover:bg-red-50">
                    <Trash2 className="h-4 w-4" aria-hidden /><span className="sr-only">Delete section</span>
                  </ConfirmSubmit>
                </div>
              )}
            </div>

            {s.items.length > 0 ? (
              <ul className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200">
                {s.items.map((it, ii) => (
                  <li key={it.id} className="p-3" data-testid="offering-item">
                    <div className="flex flex-wrap items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-navy-900">{it.name}{it.price && <span className="ml-2 font-semibold text-brand-700">{it.price}</span>}</p>
                        {it.description && <p className="text-sm text-slate-600">{it.description}</p>}
                      </div>
                      {editable && (
                        <div className="flex items-center gap-1">
                          <MoveButtons action={moveItemAction} fields={{ businessId: business.id, itemId: it.id }} first={ii === 0} last={ii === s.items.length - 1} />
                          <ConfirmSubmit action={deleteItemAction} fields={{ businessId: business.id, itemId: it.id }} title={`Delete “${it.name}”?`} confirmLabel="Delete item" className="btn-ghost px-2.5 text-red-600 hover:bg-red-50">
                            <Trash2 className="h-4 w-4" aria-hidden /><span className="sr-only">Delete item</span>
                          </ConfirmSubmit>
                        </div>
                      )}
                    </div>
                    {editable && (
                      <details className="mt-2">
                        <summary className="inline-flex min-h-9 cursor-pointer items-center gap-1 text-sm font-medium text-brand-700"><Pencil className="h-3.5 w-3.5" aria-hidden /> Edit item</summary>
                        <div className="mt-3"><ItemForm businessId={business.id} sectionId={s.id} item={{ id: it.id, name: it.name, description: it.description ?? "", price: it.price ?? "" }} /></div>
                      </details>
                    )}
                  </li>
                ))}
              </ul>
            ) : <p className="mt-4 text-sm text-slate-500">No items in this section yet.</p>}

            {editable && (
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                <details className="rounded-xl bg-slate-50 p-3">
                  <summary className="cursor-pointer text-sm font-semibold text-navy-900">Add an item</summary>
                  <div className="mt-3"><ItemForm businessId={business.id} sectionId={s.id} /></div>
                </details>
                <details className="rounded-xl bg-slate-50 p-3">
                  <summary className="cursor-pointer text-sm font-semibold text-navy-900">Edit section details</summary>
                  <div className="mt-3"><SectionForm businessId={business.id} section={{ id: s.id, kind: s.kind, title: s.title, description: s.description ?? "" }} /></div>
                </details>
              </div>
            )}
          </section>
        ))}

        {editable && (
          <Panel title="Add a section" description="Group what you offer — e.g. “Services”, “Brake repair”, “Breakfast” or “Drinks”.">
            <SectionForm businessId={business.id} />
          </Panel>
        )}
      </div>
    </>
  );
}

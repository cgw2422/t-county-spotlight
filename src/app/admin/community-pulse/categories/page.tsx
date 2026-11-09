import Link from "next/link";
import { ChevronDown, ChevronUp, ListOrdered, Plus, Save, Trash2 } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader, Card } from "@/components/admin/page-header";
import { ActionForm, Submit } from "@/components/admin/action-form";
import { ActionButton, ConfirmButton } from "@/components/admin/action-button";
import { EmptyState } from "@/components/ui/empty-state";
import { deletePulseCategory, movePulseCategory, savePulseCategory } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Community Pulse categories" };

export default async function PulseCategoriesPage() {
  const user = await requireStaff();
  const isAdmin = user.role === "ADMIN";
  const cats = await db.pulseCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], include: { _count: { select: { pulses: true } } } });

  return (
    <>
      <PageHeader title="Community Pulse categories" description="Topics used to group entries on the public archive. Use the arrows to change their order." back={{ href: "/admin/community-pulse/", label: "Community Pulse" }} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card title="Categories" bodyClassName="p-0">
          {cats.length === 0 ? (
            <div className="p-5"><EmptyState icon={ListOrdered} title="No categories yet">Add the first one on the right.</EmptyState></div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {cats.map((c) => (
                <li key={c.id} className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:px-5">
                  {isAdmin ? (
                    <ActionForm action={savePulseCategory} className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                      <input type="hidden" name="id" value={c.id} />
                      <label className="sr-only" htmlFor={`c-${c.id}-name`}>Name</label>
                      <input id={`c-${c.id}-name`} name="name" defaultValue={c.name} required maxLength={80} className="input min-w-0 flex-1 sm:max-w-[14rem]" />
                      <label className="sr-only" htmlFor={`c-${c.id}-slug`}>Slug</label>
                      <input id={`c-${c.id}-slug`} name="slug" defaultValue={c.slug} maxLength={120} className="input min-w-0 flex-1 font-mono text-sm sm:max-w-[12rem]" />
                      <Submit className="btn-secondary btn-sm"><Save className="h-4 w-4" /><span className="sr-only sm:not-sr-only">Save</span></Submit>
                    </ActionForm>
                  ) : (
                    <p className="min-w-0 flex-1 font-medium text-slate-800">{c.name} <span className="font-mono text-xs text-slate-500">{c.slug}</span></p>
                  )}
                  <div className="flex items-center gap-1">
                    <Link href={`/admin/community-pulse/?category=${c.id}`} className="btn-ghost btn-sm whitespace-nowrap">{c._count.pulses} {c._count.pulses === 1 ? "entry" : "entries"}</Link>
                    {isAdmin && (
                      <>
                        <ActionButton action={movePulseCategory} fields={{ id: c.id, dir: "up" }} className="btn-ghost btn-sm disabled:opacity-30" title="Move up"><ChevronUp className="h-4 w-4" /><span className="sr-only">Move {c.name} up</span></ActionButton>
                        <ActionButton action={movePulseCategory} fields={{ id: c.id, dir: "down" }} className="btn-ghost btn-sm" title="Move down"><ChevronDown className="h-4 w-4" /><span className="sr-only">Move {c.name} down</span></ActionButton>
                        <ConfirmButton
                          action={deletePulseCategory}
                          fields={{ id: c.id, ...(c._count.pulses ? { force: "1" } : {}) }}
                          title={`Delete “${c.name}”?`}
                          body={c._count.pulses ? <>{c._count.pulses} {c._count.pulses === 1 ? "entry uses" : "entries use"} this category and will become uncategorized.</> : "This category isn’t used by any entry."}
                          className="btn-ghost btn-sm text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" /><span className="sr-only">Delete {c.name}</span>
                        </ConfirmButton>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        {isAdmin && (
          <Card title="Add a category">
            <ActionForm action={savePulseCategory} resetOnSuccess className="space-y-3">
              <div>
                <label className="label" htmlFor="new-cat-name">Name</label>
                <input id="new-cat-name" name="name" required maxLength={80} className="input" placeholder="e.g. Pets" />
              </div>
              <div>
                <label className="label" htmlFor="new-cat-slug">Slug (optional)</label>
                <input id="new-cat-slug" name="slug" maxLength={120} className="input font-mono text-sm" placeholder="auto from name" />
              </div>
              <Submit className="btn-primary w-full"><Plus className="h-4 w-4" /> Add category</Submit>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}

import { ChevronDown, ChevronUp, Trash2, Tags } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader, Card } from "@/components/admin/page-header";
import { ActionForm, Submit } from "@/components/admin/action-form";
import { ActionButton, ConfirmButton } from "@/components/admin/action-button";
import { TextField } from "@/components/admin/form-field";
import { EmptyState } from "@/components/ui/empty-state";
import { deleteEventCategory, moveEventCategory, saveEventCategory } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Event categories" };

export default async function EventCategoriesPage() {
  await requireStaff();
  const cats = await db.eventCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], include: { _count: { select: { events: true } } } });
  return (
    <>
      <PageHeader title="Event categories" back={{ href: "/admin/events/", label: "Events" }} description="Used to filter the events calendar." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card bodyClassName="p-0" title={`${cats.length} categories`}>
          {cats.length ? (
            <ul className="divide-y divide-slate-100">
              {cats.map((c, i) => (
                <li key={c.id} className="flex items-start gap-2 px-3 py-3 sm:px-4">
                  <div className="flex shrink-0 flex-col">
                        <ActionButton action={moveEventCategory} fields={{ id: c.id, dir: "up" }} className="grid h-7 w-8 place-items-center rounded text-slate-500 hover:bg-slate-100 disabled:opacity-30" title="Move up"><ChevronUp className="h-4 w-4" /><span className="sr-only">Move {c.name} up</span></ActionButton>
                        <ActionButton action={moveEventCategory} fields={{ id: c.id, dir: "down" }} className="grid h-7 w-8 place-items-center rounded text-slate-500 hover:bg-slate-100" title="Move down"><ChevronDown className="h-4 w-4" /><span className="sr-only">Move {c.name} down</span></ActionButton>
                  </div>
                  <details className="group min-w-0 flex-1 pt-1">
                    <summary className="flex cursor-pointer list-none items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-slate-900">{c.name}</p>
                        <p className="text-xs text-slate-500">/{c.slug}/ · {c._count.events} event{c._count.events === 1 ? "" : "s"}{i === 0 ? " · first" : ""}</p>
                      </div>
                      <span className="btn-ghost btn-sm text-brand-700 group-open:hidden">Edit</span>
                      <span className="btn-ghost btn-sm hidden group-open:inline-flex">Close</span>
                    </summary>
                    <ActionForm action={saveEventCategory} className="mt-3 grid gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-2">
                      <input type="hidden" name="id" value={c.id} />
                      <TextField name="name" label="Name" defaultValue={c.name} required />
                      <TextField name="slug" label="Slug" defaultValue={c.slug} />
                      <div className="flex flex-wrap gap-2 sm:col-span-2">
                        <Submit className="btn-primary btn-sm" pendingText="Saving…">Save</Submit>
                        <ConfirmButton action={deleteEventCategory} fields={{ id: c.id }} title={`Delete “${c.name}”?`} body={c._count.events ? `${c._count.events} event(s) will become uncategorized.` : "This category has no events."}>
                          <Trash2 className="h-4 w-4" /> Delete
                        </ConfirmButton>
                      </div>
                    </ActionForm>
                  </details>
                </li>
              ))}
            </ul>
          ) : <div className="p-5"><EmptyState icon={Tags} title="No categories yet" /></div>}
        </Card>
        <Card title="Add category" className="lg:self-start">
          <ActionForm action={saveEventCategory} resetOnSuccess className="space-y-3">
            <TextField name="name" label="Name" required placeholder="Festivals" />
            <TextField name="slug" label="Slug" help="Optional — generated from the name." />
            <Submit pendingText="Adding…">Add category</Submit>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}

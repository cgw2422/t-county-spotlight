import { ChevronUp, ChevronDown, Eye, EyeOff, Trash2, ExternalLink, Menu as MenuIcon } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { pageHref } from "@/lib/links";
import { cn } from "@/lib/utils";
import { PageHeader, Card } from "@/components/admin/page-header";
import { LinkTabs } from "@/components/admin/tabs";
import { ActionForm, Submit } from "@/components/admin/action-form";
import { ActionButton, ConfirmButton } from "@/components/admin/action-button";
import { Checkbox, TextField } from "@/components/admin/form-field";
import { EmptyState } from "@/components/ui/empty-state";
import { spGet, type SP } from "../_lib/list";
import { LinkFields } from "./link-fields";
import { deleteMenuItem, moveMenuItem, saveMenuItem, toggleMenuItem } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Menus" };

const LOCS = [
  { key: "HEADER", label: "Header", help: "Main navigation at the top of every page." },
  { key: "FOOTER", label: "Footer", help: "Links in the site footer." },
  { key: "MOBILE", label: "Mobile", help: "Mobile menu drawer." },
] as const;

export default async function MenusPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin();
  const sp = await searchParams;
  const loc = LOCS.find((l) => l.key === spGet(sp, "loc").toUpperCase()) ?? LOCS[0];
  const [items, counts, pagesRaw] = await Promise.all([
    db.menuItem.findMany({ where: { location: loc.key }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    Promise.all(LOCS.map((l) => db.menuItem.count({ where: { location: l.key } }))),
    db.page.findMany({ where: { status: "PUBLISHED", deletedAt: null }, orderBy: { title: "asc" }, select: { id: true, title: true, slug: true, legacyPath: true } }),
  ]);
  const pages = pagesRaw.map((p) => ({ id: p.id, title: p.title, href: pageHref(p) }));
  const pageByHref = new Map(pages.map((p) => [p.href, p.id]));
  return (
    <>
      <PageHeader title="Menus" description="Navigation links for the header, footer and mobile menu." />
      <LinkTabs items={LOCS.map((l, i) => ({ label: l.label, href: `/admin/menus/?loc=${l.key.toLowerCase()}`, active: l.key === loc.key, count: counts[i] }))} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card title={`${loc.label} menu`} description={loc.help} bodyClassName="p-0">
          {items.length ? (
            <ul className="divide-y divide-slate-100">
              {items.map((m, i) => (
                <li key={m.id} className={cn("flex items-start gap-2 px-3 py-3 sm:px-4", !m.isVisible && "bg-slate-50")}>
                  <div className="flex shrink-0 flex-col">
                    {i > 0 ? <ActionButton action={moveMenuItem} fields={{ id: m.id, dir: "up" }} className="grid h-8 w-9 place-items-center rounded text-slate-500 hover:bg-slate-100"><ChevronUp className="h-4 w-4" /><span className="sr-only">Move {m.label} up</span></ActionButton> : <span className="h-8 w-9" />}
                    {i < items.length - 1 ? <ActionButton action={moveMenuItem} fields={{ id: m.id, dir: "down" }} className="grid h-8 w-9 place-items-center rounded text-slate-500 hover:bg-slate-100"><ChevronDown className="h-4 w-4" /><span className="sr-only">Move {m.label} down</span></ActionButton> : <span className="h-8 w-9" />}
                  </div>
                  <details className="group min-w-0 flex-1 pt-1">
                    <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="min-w-0 flex-1">
                        <span className={cn("flex items-center gap-1.5 font-medium", m.isVisible ? "text-slate-900" : "text-slate-500")}>{m.label}{m.openInNewTab && <ExternalLink className="h-3.5 w-3.5 text-slate-400" aria-label="Opens in new tab" />}</span>
                        <span className="block truncate text-xs text-slate-500">{m.href}</span>
                      </span>
                      {!m.isVisible && <span className="badge-gray">Hidden</span>}
                      <span className="text-sm font-semibold text-brand-700 group-open:hidden">Edit</span>
                    </summary>
                    <ActionForm action={saveMenuItem} className="mt-3 space-y-3 rounded-xl bg-slate-50 p-3">
                      <input type="hidden" name="id" value={m.id} />
                      <input type="hidden" name="location" value={m.location} />
                      <TextField name="label" label="Label" defaultValue={m.label} required maxLength={80} />
                      <LinkFields pages={pages} defaultHref={m.href} defaultPageId={pageByHref.get(m.href) ?? ""} />
                      <Checkbox name="openInNewTab" label="Open in a new tab" defaultChecked={m.openInNewTab} />
                      <Checkbox name="isVisible" label="Visible" defaultChecked={m.isVisible} />
                      <div className="flex flex-wrap gap-2">
                        <Submit className="btn-primary btn-sm" pendingText="Saving…">Save</Submit>
                        <ConfirmButton action={deleteMenuItem} fields={{ id: m.id }} title={`Remove “${m.label}”?`} confirmLabel="Remove"><Trash2 className="h-4 w-4" /> Remove</ConfirmButton>
                      </div>
                    </ActionForm>
                  </details>
                  <ActionButton action={toggleMenuItem} fields={{ id: m.id }} className="btn-ghost btn-sm shrink-0" title={m.isVisible ? "Hide" : "Show"}>
                    {m.isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}<span className="sr-only">{m.isVisible ? `Hide ${m.label}` : `Show ${m.label}`}</span>
                  </ActionButton>
                </li>
              ))}
            </ul>
          ) : <div className="p-5"><EmptyState icon={MenuIcon} title="This menu is empty" /></div>}
        </Card>
        <Card title="Add link" className="lg:self-start">
          <ActionForm action={saveMenuItem} resetOnSuccess className="space-y-3">
            <input type="hidden" name="location" value={loc.key} />
            <TextField name="label" label="Label" required maxLength={80} />
            <LinkFields pages={pages} />
            <Checkbox name="openInNewTab" label="Open in a new tab" />
            <Checkbox name="isVisible" label="Visible" defaultChecked />
            <Submit pendingText="Adding…">Add to {loc.label.toLowerCase()} menu</Submit>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}

import { ArrowRightLeft, Trash2 } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader, Card } from "@/components/admin/page-header";
import { ListToolbar } from "@/components/admin/list-toolbar";
import { Pagination } from "@/components/admin/data-table";
import { ActionForm, Submit } from "@/components/admin/action-form";
import { ConfirmButton } from "@/components/admin/action-button";
import { SelectField, TextField } from "@/components/admin/form-field";
import { EmptyState } from "@/components/ui/empty-state";
import { pageParams, spGet, type SP } from "../_lib/list";
import { deleteRedirect, saveRedirect } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Redirects" };

const CODES = [{ value: "301", label: "301 — permanent" }, { value: "302", label: "302 — temporary" }];

export default async function RedirectsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireStaff();
  const sp = await searchParams;
  const q = spGet(sp, "q"), source = spGet(sp, "source");
  const sort = spGet(sp, "sort");
  const { page, take, skip, perPage } = pageParams(sp, 50);
  const where: Prisma.RedirectWhereInput = {
    ...(source ? { source } : {}),
    ...(q ? { OR: [{ fromPath: { contains: q, mode: "insensitive" } }, { toPath: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const [rows, total, sources] = await Promise.all([
    db.redirect.findMany({ where, skip, take, orderBy: sort === "hits" ? { hits: "desc" } : { createdAt: "desc" } }),
    db.redirect.count({ where }),
    db.redirect.groupBy({ by: ["source"], _count: { _all: true } }),
  ]);
  return (
    <>
      <PageHeader title="Redirects" description="Send old URLs to new ones. WordPress URLs that changed during migration are redirected automatically (source: migration)." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="card min-w-0 overflow-hidden">
          <ListToolbar placeholder="Search paths…" filters={[
            { name: "source", label: "Source", options: sources.map((s) => ({ value: s.source, label: `${s.source} (${s._count._all})` })) },
            { name: "sort", label: "Sort", options: [{ value: "hits", label: "Most hits" }] },
          ]} />
          {rows.length ? (
            <ul className="divide-y divide-slate-100">
              {rows.map((r) => (
                <li key={r.id} className="px-4 py-3 sm:px-5">
                  <details className="group">
                    <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="min-w-0 flex-1 text-sm">
                        <code className="break-all font-semibold text-slate-900">{r.fromPath}</code>
                        <span className="mx-1.5 text-slate-400">→</span>
                        <code className="break-all text-slate-600">{r.toPath}</code>
                      </span>
                      <span className="badge-gray">{r.statusCode}</span>
                      {r.source !== "manual" && <span className="badge-blue">{r.source}</span>}
                      <span className="text-xs tabular-nums text-slate-500">{r.hits.toLocaleString()} hit{r.hits === 1 ? "" : "s"}</span>
                      <span className="text-sm font-semibold text-brand-700 group-open:hidden">Edit</span>
                    </summary>
                    <ActionForm action={saveRedirect} className="mt-3 grid gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-2">
                      <input type="hidden" name="id" value={r.id} />
                      <TextField name="fromPath" label="From" defaultValue={r.fromPath} required />
                      <TextField name="toPath" label="To" defaultValue={r.toPath} required />
                      <SelectField name="statusCode" label="Type" defaultValue={String(r.statusCode)} options={CODES} />
                      <div className="flex flex-wrap items-end gap-2">
                        <Submit className="btn-primary btn-sm" pendingText="Saving…">Save</Submit>
                        <ConfirmButton action={deleteRedirect} fields={{ id: r.id }} title="Delete this redirect?" body={`Visitors to ${r.fromPath} will get a 404 page.`}><Trash2 className="h-4 w-4" /> Delete</ConfirmButton>
                      </div>
                    </ActionForm>
                  </details>
                </li>
              ))}
            </ul>
          ) : <div className="p-4"><EmptyState icon={ArrowRightLeft} title={q || source ? "No redirects match" : "No redirects yet"} /></div>}
          <Pagination total={total} page={page} perPage={perPage} basePath="/admin/redirects/" params={sp} />
        </div>
        <Card title="Add redirect" className="lg:self-start">
          <ActionForm action={saveRedirect} resetOnSuccess className="space-y-3">
            <TextField name="fromPath" label="From path" required placeholder="/old-page/" />
            <TextField name="toPath" label="To" required placeholder="/new-page/ or https://…" />
            <SelectField name="statusCode" label="Type" defaultValue="301" options={CODES} />
            <Submit pendingText="Adding…">Add redirect</Submit>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}

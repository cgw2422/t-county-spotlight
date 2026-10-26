import Link from "next/link";
import { Download, FileUp } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import { IMPORT_MAX_ROWS } from "@/lib/gives/import";
import { PageHeader, Card } from "@/components/admin/page-header";
import { ActionForm, Submit } from "@/components/admin/action-form";
import { uploadImport } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Import organizations" };

const STATUS: Record<string, string> = { uploaded: "Needs mapping", mapped: "Ready to review", importing: "Importing…", imported: "Imported", failed: "Failed" };

export default async function ImportOrganizationsPage() {
  await requireAdmin();
  const imports = await db.organizationImport.findMany({ orderBy: { createdAt: "desc" }, take: 25, select: { id: true, filename: true, status: true, createdAt: true, summary: true, headers: true } });
  return (
    <>
      <PageHeader title="Import organizations from CSV" back={{ href: "/admin/organizations/", label: "Nonprofits & churches" }} description="Add many nonprofit and church listings at once. You'll map columns, review validation and duplicates, and choose rows before anything is created. Imported listings are unclaimed until a representative claims them." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card title="1. Upload a CSV file">
          <ActionForm action={uploadImport} className="space-y-4">
            <div>
              <label htmlFor="f-file" className="label">CSV file</label>
              <input id="f-file" name="file" type="file" accept=".csv,text/csv" required className="block w-full text-sm file:mr-3 file:min-h-11 file:rounded-lg file:border-0 file:bg-brand-50 file:px-4 file:font-semibold file:text-brand-700 hover:file:bg-brand-100" />
              <p className="help">Up to 2 MB and {IMPORT_MAX_ROWS.toLocaleString()} rows. The first row must contain column headers. UTF-8 (Excel “CSV UTF-8”).</p>
            </div>
            <Submit pendingText="Reading file…"><FileUp className="h-4 w-4" /> Upload &amp; preview</Submit>
          </ActionForm>
        </Card>
        <Card title="Template">
          <p className="text-sm text-slate-600">Download a CSV with the expected headers. Only <strong>name</strong> is required; leave unknown values blank — never guess descriptions, missions or service times.</p>
          <a href="/admin/organizations/import/template.csv" className="btn-secondary btn-sm mt-3" download><Download className="h-4 w-4" /> Download template</a>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-slate-500">
            <li><strong>kind</strong>: nonprofit, church or community group</li>
            <li><strong>logoUrl / coverUrl</strong>: https links only, and only with an <strong>imageRights</strong> value</li>
            <li><strong>sourceUrl</strong>: where the information came from (sets “last checked” to the import date)</li>
          </ul>
        </Card>
      </div>
      <Card title="Recent imports" className="mt-6" bodyClassName="p-0">
        {imports.length ? (
          <ul className="divide-y divide-slate-100">
            {imports.map((i) => {
              const s = (i.summary ?? {}) as Record<string, number>;
              return (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm sm:px-5">
                  <Link href={`/admin/organizations/import/${i.id}/`} className="min-w-0 truncate font-medium text-slate-900 hover:text-brand-700">{i.filename}</Link>
                  <span className="flex flex-wrap items-center gap-2 text-slate-500">
                    {i.status === "imported" && <span>{s.created ?? 0} created · {s.updated ?? 0} updated</span>}
                    <span>{formatDateTime(i.createdAt)}</span>
                    <span className={i.status === "imported" ? "badge-green" : i.status === "failed" ? "badge-red" : "badge-amber"}>{STATUS[i.status] ?? i.status}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        ) : <p className="px-5 py-6 text-sm text-slate-500">No imports yet.</p>}
      </Card>
    </>
  );
}

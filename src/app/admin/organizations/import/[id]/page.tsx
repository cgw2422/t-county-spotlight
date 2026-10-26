import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, Download, Play, Trash2 } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import { KIND_LABEL, ORG_KINDS } from "@/lib/gives/constants";
import { IMPORT_FIELDS, OUTCOME_LABEL, analyzeImport, readDefaults, readMapping, suggestMapping, type ImportResult } from "@/lib/gives/import";
import { PageHeader, Card, Notice } from "@/components/admin/page-header";
import { ActionForm, Submit } from "@/components/admin/action-form";
import { ActionButton } from "@/components/admin/action-button";
import { discardImport, reopenMapping, runImport, saveImportMapping } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Import organizations" };

const OUTCOME_BADGE: Record<string, string> = { created: "badge-green", updated: "badge-blue", skipped_duplicate: "badge-amber", skipped_claimed: "badge-orange", skipped: "badge-gray", error: "badge-red" };

function Steps({ step }: { step: number }) {
  const labels = ["Upload", "Map columns", "Review & select", "Summary"];
  return (
    <ol className="mb-6 flex flex-wrap gap-2 text-sm">
      {labels.map((l, i) => (
        <li key={l} className={i + 1 === step ? "badge-blue" : i + 1 < step ? "badge-green" : "badge-gray"}>{i + 1}. {l}</li>
      ))}
    </ol>
  );
}

export default async function ImportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const imp = await db.organizationImport.findUnique({ where: { id } });
  if (!imp) notFound();
  const rows = (Array.isArray(imp.rows) ? imp.rows : []) as string[][];
  const back = { href: "/admin/organizations/import/", label: "Imports" };
  const fid = { importId: imp.id };

  // ───── Step 2: mapping ─────
  if (imp.status === "uploaded") {
    const mapping = imp.mapping ? readMapping(imp.mapping, imp.headers.length) : suggestMapping(imp.headers);
    const defaults = readDefaults(imp.defaults);
    const preview = rows.slice(0, 20);
    return (
      <>
        <PageHeader title={imp.filename} back={back} description={`${rows.length.toLocaleString()} data rows · ${imp.headers.length} columns · uploaded ${formatDateTime(imp.createdAt)}`} actions={<ActionButton action={discardImport} fields={fid} confirm={{ title: "Discard this upload?", confirmLabel: "Discard", danger: true }}><Trash2 className="h-4 w-4" /> Discard</ActionButton>} />
        <Steps step={2} />
        <ActionForm action={saveImportMapping} className="space-y-6">
          <input type="hidden" name="importId" value={imp.id} />
          <Card title="Map columns to fields" description="We suggested fields from the header names. Choose “Ignore” for columns you don't want to import.">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {imp.headers.map((h, i) => (
                <div key={i} className="min-w-0">
                  <label htmlFor={`col-${i}`} className="label truncate">{h}</label>
                  <select id={`col-${i}`} name={`col_${i}`} defaultValue={mapping[i]} className="input">
                    <option value="ignore">— Ignore —</option>
                    {IMPORT_FIELDS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                  </select>
                  <p className="help truncate">e.g. {rows.find((r) => r[i])?.[i]?.slice(0, 40) || "(empty)"}</p>
                </div>
              ))}
            </div>
          </Card>
          <Card title="Defaults for every row">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="f-defaultKind" className="label">Kind when the row has no kind</label>
                <select id="f-defaultKind" name="defaultKind" defaultValue={defaults.kind} className="input">
                  {ORG_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="f-publish" className="label">Publish on import?</label>
                <select id="f-publish" name="publish" defaultValue={defaults.publish ? "yes" : "no"} className="input">
                  <option value="no">No — import as drafts (review, then publish)</option>
                  <option value="yes">Yes — publish immediately</option>
                </select>
              </div>
            </div>
          </Card>
          <Card title={`Preview (first ${preview.length} rows)`} bodyClassName="p-0">
            <div className="max-w-full overflow-x-auto">
              <table className="table-base min-w-max text-xs">
                <thead><tr><th>#</th>{imp.headers.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
                <tbody>{preview.map((r, ri) => <tr key={ri}><td>{ri + 1}</td>{imp.headers.map((_, i) => <td key={i} className="max-w-[220px] truncate whitespace-pre-line align-top">{r[i]}</td>)}</tr>)}</tbody>
              </table>
            </div>
          </Card>
          <Submit pendingText="Checking rows…">Continue to review</Submit>
        </ActionForm>
      </>
    );
  }

  // ───── Step 3: review & select ─────
  if (imp.status === "mapped") {
    const mapping = readMapping(imp.mapping, imp.headers.length);
    const defaults = readDefaults(imp.defaults);
    const analyzed = await analyzeImport(rows, mapping, defaults);
    const counts = {
      valid: analyzed.filter((r) => !r.errors.length).length,
      invalid: analyzed.filter((r) => r.errors.length).length,
      dupExisting: analyzed.filter((r) => r.existing.length).length,
      dupClaimed: analyzed.filter((r) => r.existing.some((e) => e.ownershipStatus === "CLAIMED")).length,
      dupFile: analyzed.filter((r) => r.inFileDupOf !== null).length,
      selected: analyzed.filter((r) => r.defaultInclude).length,
    };
    return (
      <>
        <PageHeader title={imp.filename} back={back} description={`${rows.length.toLocaleString()} rows · new listings will be ${defaults.publish ? "published immediately" : "saved as drafts"} · default kind ${KIND_LABEL[defaults.kind]}`}
          actions={<ActionButton action={reopenMapping} fields={fid}><ArrowLeft className="h-4 w-4" /> Change mapping</ActionButton>} />
        <Steps step={3} />
        <div className="mb-4 flex flex-wrap gap-2 text-sm">
          <span className="badge-green">{counts.valid} valid</span>
          <span className="badge-red">{counts.invalid} with errors</span>
          <span className="badge-amber">{counts.dupExisting} match existing listings</span>
          <span className="badge-orange">{counts.dupClaimed} match claimed listings</span>
          <span className="badge-amber">{counts.dupFile} duplicates within the file</span>
          <span className="badge-blue">{counts.selected} selected by default</span>
        </div>
        <ActionForm action={runImport} className="space-y-4">
          <input type="hidden" name="importId" value={imp.id} />
          <div className="card overflow-hidden">
            <div className="max-w-full overflow-x-auto">
              <table className="table-base text-sm">
                <thead><tr><th className="w-16">Row</th><th>Import?</th><th className="min-w-[200px]">Organization</th><th className="min-w-[260px]">Checks</th></tr></thead>
                <tbody>
                  {analyzed.map((r) => (
                    <tr key={r.index} className={r.errors.length ? "bg-red-50/40" : r.existing.length || r.inFileDupOf !== null ? "bg-amber-50/40" : ""}>
                      <td className="align-top tabular-nums">{r.index + 1}</td>
                      <td className="align-top">
                        {r.existing.length ? (
                          <select name={`act_${r.index}`} defaultValue="skip" className="input min-w-[190px] py-1.5 text-sm" aria-label={`Row ${r.index + 1} duplicate action`}>
                            <option value="skip">Skip (duplicate)</option>
                            {r.existing.length === 1 && r.existing[0].updatable && !r.errors.length && <option value="update">Update unclaimed listing (fill empty fields only)</option>}
                          </select>
                        ) : (
                          <label className="flex min-h-9 items-center gap-2">
                            <input type="checkbox" name={`inc_${r.index}`} defaultChecked={r.defaultInclude} disabled={!!r.errors.length} className="h-5 w-5 accent-brand-600" aria-label={`Import row ${r.index + 1}`} />
                            <span className="text-xs text-slate-500">{r.errors.length ? "Fix in file" : r.inFileDupOf !== null ? "Create anyway" : "Create"}</span>
                          </label>
                        )}
                      </td>
                      <td className="align-top">
                        <p className="font-medium text-slate-900">{r.data.name || <span className="text-red-700">(no name)</span>}</p>
                        <p className="text-xs text-slate-500">{[KIND_LABEL[r.data.kind], r.data.city, r.data.website].filter(Boolean).join(" · ")}</p>
                      </td>
                      <td className="align-top text-xs">
                        {r.errors.map((e, i) => <p key={`e${i}`} className="text-red-700">✕ {e}</p>)}
                        {r.existing.map((e) => (
                          <p key={e.id} className={e.ownershipStatus === "CLAIMED" ? "text-orange-800" : "text-amber-800"}>
                            ⚠ Matches <Link href={`/admin/organizations/${e.id}/`} target="_blank" className="font-semibold underline">{e.name}</Link> ({e.reasons.join(", ")}) — {e.why}
                          </p>
                        ))}
                        {r.inFileDupOf !== null && <p className="text-amber-800">⚠ Duplicate of row {r.inFileDupOf + 1} in this file ({r.inFileReasons.join(", ")})</p>}
                        {r.warnings.map((w, i) => <p key={`w${i}`} className="text-slate-600">• {w}</p>)}
                        {!r.errors.length && !r.existing.length && r.inFileDupOf === null && !r.warnings.length && <p className="text-emerald-700">✓ Ready</p>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <Notice tone="info">Imports never change claimed listings and only fill empty fields of unclaimed ones you choose to update. Logo/cover links are kept as links (never downloaded) and only when the row has an image-rights value.</Notice>
          <Submit pendingText="Importing…"><Play className="h-4 w-4" /> Import selected rows</Submit>
        </ActionForm>
      </>
    );
  }

  // ───── Step 5: summary ─────
  const results = (Array.isArray(imp.results) ? imp.results : []) as unknown as ImportResult[];
  const s = (imp.summary ?? {}) as Record<string, number | string | boolean>;
  const notImported = results.filter((r) => r.outcome !== "created" && r.outcome !== "updated").length;
  return (
    <>
      <PageHeader title={imp.filename} back={back} description={`${imp.status === "imported" ? "Imported" : imp.status === "failed" ? "Failed" : "Importing"}${imp.completedAt ? ` ${formatDateTime(imp.completedAt)}` : ""} · ${rows.length} rows`}
        actions={notImported > 0 ? <a href={`/admin/organizations/import/${imp.id}/errors.csv`} className="btn-secondary btn-sm" download><Download className="h-4 w-4" /> Error report ({notImported} rows)</a> : undefined} />
      <Steps step={4} />
      {imp.status === "importing" && <div className="mb-4"><Notice tone="warn">This import is running. Refresh in a moment.</Notice></div>}
      {imp.status === "failed" && <div className="mb-4"><Notice tone="danger" title="The import stopped with an error"><span className="flex gap-2"><AlertTriangle className="h-4 w-4 shrink-0" /> {String(s.error ?? "Unknown error")}. Rows listed below as created were saved; re-uploading the file will detect them as duplicates.</span></Notice></div>}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[["Created", s.created, "text-emerald-700"], ["Updated", s.updated, "text-brand-700"], ["Skipped — duplicate", s.skippedDuplicate, "text-amber-700"], ["Skipped — claimed", s.skippedClaimed, "text-orange-700"], ["Not selected", s.skipped, "text-slate-600"], ["Errors", s.errors, "text-red-700"]].map(([label, n, tone]) => (
          <div key={String(label)} className="card p-4"><p className={`text-2xl font-bold tabular-nums ${tone}`}>{Number(n ?? 0)}</p><p className="text-sm text-slate-600">{label}</p></div>
        ))}
      </div>
      {imp.status === "imported" && <p className="mb-4 text-sm text-slate-600">New listings were {s.published ? "published" : "saved as drafts"}. <Link href={`/admin/organizations/?tab=approved&source=import`} className="font-semibold text-brand-700 hover:underline">See imported listings</Link></p>}
      <div className="card overflow-hidden">
        <div className="max-w-full overflow-x-auto">
          <table className="table-base text-sm">
            <thead><tr><th className="w-16">Row</th><th>Organization</th><th>Result</th><th className="min-w-[240px]">Details</th></tr></thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.row}>
                  <td className="tabular-nums">{r.row}</td>
                  <td>{r.orgId ? <Link href={`/admin/organizations/${r.orgId}/`} className="font-medium text-slate-900 hover:text-brand-700">{r.name}</Link> : r.name}</td>
                  <td><span className={OUTCOME_BADGE[r.outcome] ?? "badge-gray"}>{OUTCOME_LABEL[r.outcome] ?? r.outcome}</span></td>
                  <td className="text-xs text-slate-600">{r.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

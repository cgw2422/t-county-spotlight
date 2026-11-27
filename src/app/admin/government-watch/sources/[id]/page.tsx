import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader, Card, Notice } from "@/components/admin/page-header";
import { ActionForm, Submit } from "@/components/admin/action-form";
import { ActionButton } from "@/components/admin/action-button";
import { Checkbox, FormGrid, SelectField, TextArea, TextField } from "@/components/admin/form-field";
import { formatDateTime } from "@/lib/utils";
import { COLLECTION_METHOD_LABEL, COLLECTION_METHODS, DOC_TYPE_LABEL, DOC_TYPES, GOV_TYPE_LABEL, GOV_TYPES, VERIFICATION, VERIFICATION_LABEL, isOneOf } from "@/lib/gov-watch/shared";
import { checkNowAction, saveSourceAction } from "../../actions";
import { BASE, fmtDate } from "../../_lib";

export const dynamic = "force-dynamic";
export const metadata = { title: "Government source" };

export default async function SourcePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const isNew = id === "new";
  const s = isNew ? null : await db.govSource.findUnique({ where: { id } });
  if (!isNew && !s) notFound();
  const [runs, docs] = s ? await Promise.all([
    db.govCheckRun.findMany({ where: { sourceId: s.id }, orderBy: { startedAt: "desc" }, take: 10 }),
    db.govDocument.findMany({ where: { sourceId: s.id }, orderBy: { discoveredAt: "desc" }, take: 10, select: { id: true, title: true, docType: true, meetingDate: true, discoveredAt: true } }),
  ]) : [[], []];
  const link = (u: string | null | undefined) => u ? <a href={u} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 break-all text-brand-700 hover:underline">{u} <ExternalLink className="h-3.5 w-3.5 shrink-0" /></a> : null;
  return (
    <>
      <PageHeader title={s?.name ?? "Add a government source"} back={{ href: `${BASE}/sources/`, label: "Government sources" }}
        actions={s && (s.minutesUrl || s.agendasUrl || s.website || s.extraUrls.length) ? <ActionButton action={checkNowAction} fields={{ id: s.id }} className="btn-primary btn-sm" reloadOnSuccess>Check now</ActionButton> : undefined} />
      {s?.verification === "needs_review" && (
        <div className="mb-4"><Notice tone="warn" title="Needs review">These details came from web search results; the research couldn’t open the official site. Open the website, confirm the minutes and agendas pages and the clerk’s contact, fix anything wrong, then set the status to Verified. “Check now” tests the addresses: a successful check that finds documents is a good sign the page is right.</Notice></div>
      )}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card title="Source details">
          <ActionForm action={saveSourceAction} className="space-y-4" warnUnsaved>
            {s && <input type="hidden" name="id" value={s.id} />}
            <FormGrid>
              <TextField label="Government or board name" name="name" required defaultValue={s?.name ?? ""} placeholder="Dover City Council" />
              <TextField label="Community" name="community" required defaultValue={s?.community ?? ""} placeholder="Dover (or Tuscarawas County)" />
              <SelectField label="Type" name="govType" defaultValue={s?.govType ?? "city"} options={GOV_TYPES.map((t) => ({ value: t, label: GOV_TYPE_LABEL[t] }))} />
              <SelectField label="Collection method" name="collectionMethod" defaultValue={s?.collectionMethod ?? "web_page"} options={COLLECTION_METHODS.map((t) => ({ value: t, label: COLLECTION_METHOD_LABEL[t] }))} />
            </FormGrid>
            <TextField label="Official website" name="website" type="url" defaultValue={s?.website ?? ""} placeholder="https://" />
            <FormGrid>
              <TextField label="Meeting minutes page" name="minutesUrl" type="url" defaultValue={s?.minutesUrl ?? ""} placeholder="https://" help="The page that lists minutes (checked daily)." />
              <TextField label="Meeting agendas page" name="agendasUrl" type="url" defaultValue={s?.agendasUrl ?? ""} placeholder="https://" />
            </FormGrid>
            <TextArea label="More pages to check (optional)" name="extraUrls" rows={2} defaultValue={s?.extraUrls.join("\n") ?? ""} help="One address per line: document centers, legal notices, meeting portals." />
            <FormGrid>
              <TextField label="Clerk / fiscal officer name" name="clerkName" defaultValue={s?.clerkName ?? ""} />
              <TextField label="Title" name="clerkTitle" defaultValue={s?.clerkTitle ?? ""} placeholder="Clerk of Council" />
              <TextField label="Clerk email" name="clerkEmail" type="email" defaultValue={s?.clerkEmail ?? ""} help="Documents emailed from this address to the records inbox are filed under this source." />
              <TextField label="Clerk phone" name="clerkPhone" defaultValue={s?.clerkPhone ?? ""} />
            </FormGrid>
            <SelectField label="Review status" name="verification" defaultValue={s?.verification ?? "needs_review"} options={VERIFICATION.map((t) => ({ value: t, label: VERIFICATION_LABEL[t] }))} help="Only mark Verified after checking the official site yourself." />
            <Checkbox name="active" label="Check this source automatically every day" defaultChecked={s?.active ?? true} />
            <TextArea label="Notes" name="notes" rows={3} defaultValue={s?.notes ?? ""} />
            <Submit>{s ? "Save source" : "Add source"}</Submit>
          </ActionForm>
        </Card>
        {s && (
          <aside className="space-y-4">
            <Card title="Collection status">
              <dl className="space-y-1.5 text-sm">
                <div><dt className="inline text-slate-500">Last check: </dt><dd className="inline">{s.lastCheckedAt ? `${formatDateTime(s.lastCheckedAt)} (${s.lastStatus === "error" ? "failed" : "OK"})` : "Never"}</dd></div>
                <div><dt className="inline text-slate-500">Last successful check: </dt><dd className="inline">{s.lastSuccessAt ? formatDateTime(s.lastSuccessAt) : "—"}</dd></div>
                {s.verifiedAt && <div><dt className="inline text-slate-500">Verified: </dt><dd className="inline">{formatDateTime(s.verifiedAt)}</dd></div>}
              </dl>
              {s.lastError && <p className="mt-2 whitespace-pre-line break-words rounded-lg bg-red-50 p-2 text-xs text-red-800" data-testid="source-error">{s.lastError}</p>}
            </Card>
            {(s.website || s.minutesUrl || s.agendasUrl) && <Card title="Links"><div className="space-y-1 text-sm">{link(s.website)}{link(s.minutesUrl)}{link(s.agendasUrl)}</div></Card>}
            {s.evidence.length > 0 && <Card title="Where these details came from"><ul className="space-y-1 text-xs">{s.evidence.map((e) => <li key={e} className="break-all">{/^https?:/.test(e) ? link(e) : e}</li>)}</ul></Card>}
            <Card title="Recent checks">
              {runs.length ? <ul className="space-y-1.5 text-xs">{runs.map((r) => <li key={r.id}><span className={r.status === "error" ? "font-semibold text-red-700" : "font-semibold text-emerald-700"}>{r.status === "error" ? "Failed" : r.status === "running" ? "Running" : "OK"}</span> {formatDateTime(r.startedAt)} ({r.trigger}) <span className="block break-words text-slate-500">{r.message}</span></li>)}</ul> : <p className="text-sm text-slate-500">Not checked yet.</p>}
            </Card>
            <Card title="Latest documents">
              {docs.length ? <ul className="space-y-1.5 text-sm">{docs.map((d) => <li key={d.id}><Link href={`${BASE}/documents/${d.id}/`} className="text-brand-700 hover:underline">{d.title}</Link><span className="block text-xs text-slate-500">{isOneOf(DOC_TYPES, d.docType) ? DOC_TYPE_LABEL[d.docType] : d.docType}{d.meetingDate ? ` · ${fmtDate(d.meetingDate)}` : ""}</span></li>)}</ul> : <p className="text-sm text-slate-500">None yet.</p>}
            </Card>
          </aside>
        )}
      </div>
    </>
  );
}

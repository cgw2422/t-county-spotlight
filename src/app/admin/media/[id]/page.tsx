import { notFound } from "next/navigation";
import Link from "next/link";
import { Trash2, Copy, ExternalLink } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import { PageHeader, Card, Notice } from "@/components/admin/page-header";
import { ActionForm, Submit } from "@/components/admin/action-form";
import { ConfirmButton } from "@/components/admin/action-button";
import { TextArea, TextField } from "@/components/admin/form-field";
import { findMediaUsage } from "../usage";
import { deleteMedia, updateMedia } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Media" };

export default async function MediaItemPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  const m = await db.media.findUnique({ where: { id }, include: { uploadedBy: { select: { email: true, name: true } } } });
  if (!m || m.deletedAt) notFound();
  const usage = await findMediaUsage(m.url);
  const live = usage.filter((u) => u.live);
  return (
    <>
      <PageHeader title={m.title || m.filename} back={{ href: "/admin/media/", label: "Media library" }} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <div className="card overflow-hidden">
            <div className="grid place-items-center bg-[conic-gradient(#f1f5f9_25%,#fff_0_50%,#f1f5f9_0_75%,#fff_0)] bg-[length:20px_20px] p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.url} alt={m.alt ?? ""} className="max-h-[60vh] w-auto max-w-full rounded-lg object-contain shadow" />
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-4 py-3 text-sm">
              <code className="min-w-0 flex-1 truncate rounded bg-slate-100 px-2 py-1 text-xs">{m.url}</code>
              <a href={m.url} target="_blank" rel="noreferrer" className="btn-ghost btn-sm"><ExternalLink className="h-4 w-4" /> Open</a>
            </div>
          </div>
          <Card title="Where it's used" description={usage.length ? `${usage.length} reference${usage.length === 1 ? "" : "s"}` : undefined} bodyClassName="p-0">
            {usage.length ? (
              <ul className="divide-y divide-slate-100">
                {usage.map((u, i) => (
                  <li key={i} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 sm:px-5">
                    <div className="min-w-0"><Link href={u.href} className="font-medium text-slate-900 hover:text-brand-700">{u.title}</Link><p className="text-xs text-slate-500">{u.type} · {u.field}</p></div>
                    {u.live ? <span className="badge-green">Live</span> : <span className="badge-gray">Not public</span>}
                  </li>
                ))}
              </ul>
            ) : <p className="px-5 py-6 text-sm text-slate-500">Not used anywhere. It's safe to delete.</p>}
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="Details">
            <ActionForm action={updateMedia} className="space-y-4">
              <input type="hidden" name="id" value={m.id} />
              <TextField name="alt" label="Alt text" defaultValue={m.alt ?? ""} maxLength={300} help="Describe the image for people using screen readers." />
              <TextField name="title" label="Title" defaultValue={m.title ?? ""} maxLength={200} />
              <TextArea name="caption" label="Caption" defaultValue={m.caption ?? ""} rows={2} maxLength={1000} />
              <Submit pendingText="Saving…">Save details</Submit>
            </ActionForm>
            <dl className="mt-5 space-y-1.5 border-t border-slate-100 pt-4 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-slate-500">File</dt><dd className="truncate">{m.filename}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Type</dt><dd>{m.mimeType}</dd></div>
              {m.width && <div className="flex justify-between gap-3"><dt className="text-slate-500">Dimensions</dt><dd>{m.width} × {m.height}</dd></div>}
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Size</dt><dd>{(m.size / 1024).toFixed(0)} KB</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Added</dt><dd>{formatDateTime(m.createdAt)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-500">By</dt><dd className="truncate">{m.uploadedBy ? m.uploadedBy.name || m.uploadedBy.email : m.sourceUrl ? "WordPress import" : "—"}</dd></div>
              {m.sourceUrl && <div className="flex justify-between gap-3"><dt className="text-slate-500">Original</dt><dd className="truncate"><a className="text-brand-700 hover:underline" href={m.sourceUrl} target="_blank" rel="noreferrer">{m.sourceUrl}</a></dd></div>}
            </dl>
          </Card>
          <Card title="Delete">
            {live.length ? (
              <Notice tone="warn" title="In use on the live site">This image can't be deleted while {live.length} published item{live.length === 1 ? " uses" : "s use"} it. Replace it in those items first.</Notice>
            ) : (
              <>
                <p className="mb-3 text-sm text-slate-600">{usage.length ? "Only drafts or hidden items reference this image; they'll show a broken image." : "Removes the file from storage."}</p>
                <ConfirmButton action={deleteMedia} fields={{ id: m.id }} title="Delete this image?" body="The file is removed from storage. This cannot be undone." confirmLabel="Delete image"><Trash2 className="h-4 w-4" /> Delete image</ConfirmButton>
              </>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

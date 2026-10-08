import Link from "next/link";
import { ImageIcon } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader, Notice } from "@/components/admin/page-header";
import { ListToolbar } from "@/components/admin/list-toolbar";
import { Pagination } from "@/components/admin/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { pageParams, spGet, type SP } from "../_lib/list";
import { MediaUploader } from "./uploader";

export const dynamic = "force-dynamic";
export const metadata = { title: "Media library" };

function size(n: number) {
  return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

export default async function MediaPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireStaff();
  const sp = await searchParams;
  const q = spGet(sp, "q"), source = spGet(sp, "source");
  const { page, take, skip, perPage } = pageParams(sp, 48);
  const where: Prisma.MediaWhereInput = {
    deletedAt: null,
    ...(q ? { OR: [{ filename: { contains: q, mode: "insensitive" } }, { alt: { contains: q, mode: "insensitive" } }, { title: { contains: q, mode: "insensitive" } }] } : {}),
    ...(source === "wordpress" ? { sourceUrl: { not: null } } : source === "uploaded" ? { sourceUrl: null } : {}),
  };
  const [rows, total] = await Promise.all([
    db.media.findMany({ where, skip, take, orderBy: { createdAt: "desc" }, select: { id: true, url: true, filename: true, alt: true, width: true, height: true, size: true, sourceUrl: true } }),
    db.media.count({ where }),
  ]);
  return (
    <>
      <PageHeader title="Media library" description="Every uploaded or imported image. Click an image to edit alt text or see where it's used." />
      {sp.deleted && <div className="mb-4"><Notice tone="success">Image deleted.</Notice></div>}
      <div className="mb-4"><MediaUploader /></div>
      <div className="card overflow-hidden">
        <ListToolbar placeholder="Search filename, title or alt text…" filters={[{ name: "source", label: "Source", options: [{ value: "uploaded", label: "Uploaded" }, { value: "wordpress", label: "Imported from WordPress" }] }]} />
        {rows.length ? (
          <ul className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-3 sm:p-4 md:grid-cols-4 xl:grid-cols-6">
            {rows.map((m) => (
              <li key={m.id}>
                <Link href={`/admin/media/${m.id}/`} className="group block overflow-hidden rounded-xl border border-slate-200 bg-white transition hover:border-brand-300 hover:shadow-md">
                  <div className="relative aspect-square bg-[conic-gradient(#f1f5f9_25%,#fff_0_50%,#f1f5f9_0_75%,#fff_0)] bg-[length:16px_16px]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={m.url} alt={m.alt ?? ""} loading="lazy" className="h-full w-full object-cover" />
                    {!m.alt && <span className="absolute left-1.5 top-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">No alt</span>}
                  </div>
                  <div className="px-2 py-1.5">
                    <p className="truncate text-xs font-medium text-slate-800">{m.filename}</p>
                    <p className="text-[11px] text-slate-500">{m.width && m.height ? `${m.width}×${m.height} · ` : ""}{size(m.size)}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="p-4"><EmptyState icon={ImageIcon} title={q ? "No images match your search" : "No images yet"}>Uploaded images are stored in the configured bucket (or the database) and listed here.</EmptyState></div>
        )}
        <Pagination total={total} page={page} perPage={perPage} basePath="/admin/media/" params={sp} />
      </div>
    </>
  );
}

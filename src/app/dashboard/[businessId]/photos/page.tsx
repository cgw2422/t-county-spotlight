import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDown, ArrowUp, Images, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { requireBusinessAccess } from "@/lib/auth";
import { getBusinessEntitlements } from "@/lib/entitlements";
import { PageHeader, Panel } from "@/components/dashboard/shell";
import { PhotoAddForm } from "@/components/dashboard/photo-add-form";
import { EmptyState } from "@/components/ui/empty-state";
import { SmartImage } from "@/components/ui/smart-image";
import { deletePhotoAction, movePhotoAction } from "../actions";

export const metadata: Metadata = { title: "Photos" };
export const dynamic = "force-dynamic";

export default async function PhotosPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const { business } = await requireBusinessAccess(businessId);
  const [{ entitlements }, photos] = await Promise.all([
    getBusinessEntitlements(business.id),
    db.businessPhoto.findMany({ where: { businessId: business.id }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
  ]);
  const full = photos.length >= entitlements.maxPhotos;
  return (
    <>
      <PageHeader title="Photos" description={<>Show off your space, products and people. You&apos;re using <strong>{photos.length} of {entitlements.maxPhotos}</strong> photos.</>} />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div>
          {photos.length === 0 ? (
            <EmptyState icon={Images} title="No photos yet">Bright, real photos of your business help people decide to visit. Add your first one!</EmptyState>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {photos.map((p, i) => (
                <li key={p.id} className="card overflow-hidden">
                  <div className="relative aspect-[4/3] bg-slate-100">
                    <SmartImage src={p.url} alt={p.alt ?? ""} fill sizes="(min-width:640px) 33vw, 50vw" className="object-cover" />
                    {i === 0 && <span className="badge absolute left-2 top-2 bg-white/95 text-navy-900 shadow-sm">First photo</span>}
                  </div>
                  <div className="flex items-center justify-between gap-1 p-1.5">
                    <form action={movePhotoAction} className="flex">
                      <input type="hidden" name="businessId" value={business.id} />
                      <input type="hidden" name="photoId" value={p.id} />
                      <button name="dir" value="up" disabled={i === 0} className="btn-ghost px-2.5 disabled:opacity-30" aria-label="Move earlier"><ArrowUp className="h-4 w-4" /></button>
                      <button name="dir" value="down" disabled={i === photos.length - 1} className="btn-ghost px-2.5 disabled:opacity-30" aria-label="Move later"><ArrowDown className="h-4 w-4" /></button>
                    </form>
                    <form action={deletePhotoAction}>
                      <input type="hidden" name="businessId" value={business.id} />
                      <input type="hidden" name="photoId" value={p.id} />
                      <button className="btn-ghost px-2.5 text-red-600 hover:bg-red-50" aria-label="Delete photo"><Trash2 className="h-4 w-4" /></button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <Panel title="Add a photo">
          {full ? (
            <div className="text-sm text-slate-600">
              <p>You&apos;ve reached your plan&apos;s limit of {entitlements.maxPhotos} photos. Remove one to add another.</p>
              <Link href={`/dashboard/${business.id}/membership/`} className="btn-secondary btn-sm mt-3">Get more photo space</Link>
            </div>
          ) : (
            <PhotoAddForm businessId={business.id} />
          )}
        </Panel>
      </div>
    </>
  );
}

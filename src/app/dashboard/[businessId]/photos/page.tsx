import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDown, ArrowUp, Images, Star, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { requireBusinessAccess } from "@/lib/auth";
import { getBusinessEntitlements } from "@/lib/entitlements";
import { orderPhotos, publicGalleryPhotos } from "@/lib/listing-limits";
import { PageHeader, Panel } from "@/components/dashboard/shell";
import { GalleryUploader } from "@/components/dashboard/gallery-uploader";
import { PhotoAltForm, VisiblePhotosForm } from "@/components/dashboard/photo-controls";
import { ConfirmSubmit } from "@/components/dashboard/confirm-submit";
import { EmptyState } from "@/components/ui/empty-state";
import { SmartImage } from "@/components/ui/smart-image";
import { deletePhotoAction, movePhotoAction, setPrimaryPhotoAction } from "../actions";

export const metadata: Metadata = { title: "Photos" };
export const dynamic = "force-dynamic";

export default async function PhotosPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const { business } = await requireBusinessAccess(businessId);
  const [{ entitlements }, photos] = await Promise.all([
    getBusinessEntitlements(business.id),
    db.businessPhoto.findMany({ where: { businessId: business.id }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
  ]);
  const max = entitlements.maxPhotos;
  const premium = entitlements.tier === "PREMIUM";
  const over = photos.length > max;
  const full = photos.length >= max;
  const shown = new Set(publicGalleryPhotos(photos, max).map((p) => p.id));
  const leadId = orderPhotos(photos)[0]?.id;
  const membership = `/dashboard/${business.id}/membership/`;
  return (
    <>
      <PageHeader title="Photos" description="Show off your space, products and people. Your logo and cover photo don't count toward your gallery." />
      <p className="mb-6 flex flex-wrap items-center gap-2 text-sm">
        <span className={`rounded-full px-3 py-1 font-semibold ${over ? "bg-amber-100 text-amber-900" : "bg-white text-navy-900 ring-1 ring-slate-200"}`} data-testid="photo-counter">
          Photos: {photos.length} of {max}
        </span>
        <span className="text-slate-500">{premium ? "Premium gallery" : "Free Listing gallery"}</span>
      </p>

      {over && (
        <Panel className="mb-6 border border-amber-200 bg-amber-50/60" title={`Your plan shows ${max} photos publicly — choose which to show`}
          description={<>You have {photos.length} photos. None will be deleted; only the {max} you choose appear on your listing. {!premium && <Link href={membership} className="font-semibold text-brand-700 hover:underline">Upgrade to Premium</Link>}{!premium && " to show up to 20."} Adding new photos is paused until you&apos;re within your plan.</>}>
          <VisiblePhotosForm businessId={business.id} max={max} photos={orderPhotos(photos).map((p) => ({ id: p.id, url: p.url, alt: p.alt, visibleOnFree: p.visibleOnFree }))} />
        </Panel>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div>
          {photos.length === 0 ? (
            <EmptyState icon={Images} title="No photos yet">Bright, real photos of your business help people decide to visit. Add your first ones!</EmptyState>
          ) : (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
              {photos.map((p, i) => (
                <li key={p.id} className="card overflow-hidden" data-testid="gallery-photo">
                  <div className="relative aspect-[4/3] bg-slate-100">
                    <SmartImage src={p.url} alt={p.alt ?? ""} fill sizes="(min-width:1280px) 25vw, (min-width:640px) 40vw, 100vw" className="object-cover" />
                    <div className="absolute left-2 top-2 flex flex-wrap gap-1">
                      {p.isPrimary ? <span className="badge bg-white/95 text-navy-900 shadow-sm"><Star className="h-3 w-3 fill-amber-400 text-amber-500" aria-hidden /> Primary</span>
                        : p.id === leadId && <span className="badge bg-white/95 text-navy-900 shadow-sm">Shown first</span>}
                      {over && !shown.has(p.id) && <span className="badge bg-slate-900/80 text-white">Hidden on your plan</span>}
                    </div>
                  </div>
                  <div className="space-y-2 p-2.5">
                    <PhotoAltForm businessId={business.id} photoId={p.id} alt={p.alt ?? ""} />
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <form action={movePhotoAction} className="flex">
                        <input type="hidden" name="businessId" value={business.id} />
                        <input type="hidden" name="photoId" value={p.id} />
                        <button name="dir" value="up" disabled={i === 0} className="btn-ghost px-2.5 disabled:opacity-30" aria-label="Move earlier"><ArrowUp className="h-4 w-4" /></button>
                        <button name="dir" value="down" disabled={i === photos.length - 1} className="btn-ghost px-2.5 disabled:opacity-30" aria-label="Move later"><ArrowDown className="h-4 w-4" /></button>
                      </form>
                      {!p.isPrimary && (
                        <form action={setPrimaryPhotoAction}>
                          <input type="hidden" name="businessId" value={business.id} />
                          <input type="hidden" name="photoId" value={p.id} />
                          <button className="btn-ghost btn-sm px-2.5 text-brand-700">Make primary</button>
                        </form>
                      )}
                      <ConfirmSubmit action={deletePhotoAction} fields={{ businessId: business.id, photoId: p.id }} title="Remove this photo?"
                        body="It will be removed from your gallery. You can upload it again later." confirmLabel="Remove photo" className="btn-ghost px-2.5 text-red-600 hover:bg-red-50">
                        <Trash2 className="h-4 w-4" aria-hidden /><span className="sr-only">Remove photo</span>
                      </ConfirmSubmit>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {photos.length > 1 && <p className="mt-3 text-xs text-slate-500">Your primary photo appears first on your listing and is used as the banner when you haven&apos;t added a cover photo.</p>}
        </div>
        <Panel title="Add photos">
          {full ? (
            <div className="text-sm text-slate-600" data-testid="photo-limit">
              {premium ? (
                <p>You&apos;ve reached your plan&apos;s limit of {max} gallery photos. Remove one to add another.</p>
              ) : (
                <>
                  <p>Your Free Listing includes {max} gallery photos. Upgrade to Premium to add up to 20 photos.</p>
                  <Link href={membership} className="btn-secondary btn-sm mt-3">See Premium</Link>
                </>
              )}
            </div>
          ) : (
            <GalleryUploader businessId={business.id} remaining={max - photos.length} max={max} />
          )}
        </Panel>
      </div>
    </>
  );
}

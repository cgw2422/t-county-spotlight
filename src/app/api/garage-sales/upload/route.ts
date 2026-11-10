import { NextResponse } from "next/server";
import { clientIp, getCurrentUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { saveImageUpload, sniffImageType } from "@/lib/storage";
import { audit } from "@/lib/audit";
import { GARAGE_SALE_LIMITS } from "@/lib/garage-sales-shared";

/** Photo types residents may upload for a garage sale (no SVG/ICO/PDF). */
const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);

/**
 * Anonymous photo upload for garage sale submissions. Separate from /api/upload
 * (staff + business owners): rate-limited per IP and per form, 8 MB cap, real
 * image sniffing, at most 4 photos per form. The submit action re-checks that
 * every photo URL came from the media store.
 */
export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (origin && host) {
    try { if (new URL(origin).host !== host) return NextResponse.json({ error: "Bad origin" }, { status: 403 }); } catch { return NextResponse.json({ error: "Bad origin" }, { status: 403 }); }
  }
  const ip = await clientIp();
  if (!rateLimit(`gs-upload:${ip}`, 20, 60 * 60_000).ok) return NextResponse.json({ error: "Too many photo uploads. Please try again later." }, { status: 429 });

  const len = Number(req.headers.get("content-length") || 0);
  if (len > GARAGE_SALE_LIMITS.maxPhotoBytes + 64 * 1024) return NextResponse.json({ error: "Photos must be 8 MB or smaller." }, { status: 413 });

  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: "Invalid upload." }, { status: 400 }); }
  const file = form.get("file");
  const formKey = String(form.get("formKey") ?? "").slice(0, 64);
  const existing = Number(form.get("count") ?? 0);
  if (!(file instanceof File)) return NextResponse.json({ error: "No file provided." }, { status: 400 });
  if (!/^[a-zA-Z0-9-]{16,64}$/.test(formKey)) return NextResponse.json({ error: "Please reload the form and try again." }, { status: 400 });
  if (!Number.isFinite(existing) || existing >= GARAGE_SALE_LIMITS.maxPhotos) return NextResponse.json({ error: `You can add up to ${GARAGE_SALE_LIMITS.maxPhotos} photos.` }, { status: 400 });
  if (file.size > GARAGE_SALE_LIMITS.maxPhotoBytes) return NextResponse.json({ error: "Photos must be 8 MB or smaller." }, { status: 413 });

  const buf = Buffer.from(await file.arrayBuffer());
  const mime = sniffImageType(buf);
  if (!mime || !PHOTO_TYPES.has(mime)) return NextResponse.json({ error: "That file isn't a photo. Upload a JPG, PNG, WebP or GIF image." }, { status: 400 });
  // Allow a few replacements per form, but cap the total.
  if (!rateLimit(`gs-upload-form:${formKey}`, GARAGE_SALE_LIMITS.maxPhotos * 2, 3 * 3600_000).ok) return NextResponse.json({ error: "Too many photos for one sale." }, { status: 429 });

  try {
    const user = await getCurrentUser();
    const media = await saveImageUpload(buf, file.name || "garage-sale-photo", user?.id ?? null, { title: "Garage sale photo" });
    await audit(user?.id, "media.upload", "Media", media.id, { source: "garage_sale", filename: media.filename });
    return NextResponse.json({ url: media.url, width: media.width, height: media.height });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

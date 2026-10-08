import { NextResponse } from "next/server";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { saveImageUpload } from "@/lib/storage";
import { audit } from "@/lib/audit";

/**
 * Image upload endpoint shared by the admin and business dashboards.
 * Staff may upload freely; business owners must own `businessId`.
 */
export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (origin && host && new URL(origin).host !== host) return NextResponse.json({ error: "Bad origin" }, { status: 403 });

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!rateLimit(`upload:${user.id}`, 60, 10 * 60_000).ok) return NextResponse.json({ error: "Too many uploads, try again shortly." }, { status: 429 });

  const form = await req.formData();
  const file = form.get("file");
  const businessId = form.get("businessId")?.toString();
  const alt = form.get("alt")?.toString().slice(0, 300);
  if (!(file instanceof File)) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  if (!isStaff(user)) {
    if (!businessId) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    const owns = await db.businessOwner.findUnique({ where: { userId_businessId: { userId: user.id, businessId } } });
    if (!owns) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const media = await saveImageUpload(buf, file.name, user.id, { alt });
    await audit(user.id, "media.upload", "Media", media.id, { filename: media.filename, businessId });
    return NextResponse.json({ id: media.id, url: media.url, width: media.width, height: media.height, alt: media.alt });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

import { NextResponse } from "next/server";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { saveImageUpload } from "@/lib/storage";
import { audit } from "@/lib/audit";

/**
 * Image uploads for organization members (logo, cover, update and event images).
 * Staff may upload for any organization; members only for organizations they belong to.
 */
export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (origin && host && new URL(origin).host !== host) return NextResponse.json({ error: "Bad origin" }, { status: 403 });

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  if (!rateLimit(`gives-upload:${user.id}`, 40, 10 * 60_000).ok) return NextResponse.json({ error: "Too many uploads, try again shortly." }, { status: 429 });

  const form = await req.formData();
  const file = form.get("file");
  const orgId = form.get("orgId")?.toString().slice(0, 40) ?? "";
  if (!(file instanceof File)) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  if (!isStaff(user)) {
    const m = orgId
      ? await db.organizationMember.findUnique({ where: { userId_organizationId: { userId: user.id, organizationId: orgId } }, include: { organization: { select: { status: true, deletedAt: true } } } })
      : null;
    if (!m || m.organization.deletedAt || ["SUSPENDED", "ARCHIVED"].includes(m.organization.status)) {
      return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    }
  }

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const media = await saveImageUpload(buf, file.name, user.id);
    await audit(user.id, "media.upload", "Media", media.id, { filename: media.filename, organizationId: orgId || null });
    return NextResponse.json({ id: media.id, url: media.url, width: media.width, height: media.height });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

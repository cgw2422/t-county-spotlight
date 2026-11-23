import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { designRenderContext, toMeta } from "@/lib/newsletter-designer/server";
import { renderEmailDocument } from "@/lib/newsletter-designer/render";

/** Full-page preview of the saved issue (admin only). ?clean=1 hides the preview notes (sponsor / beehiiv footer). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const row = await db.newsletterDesign.findUnique({ where: { id } });
  if (!row) return new Response("Not found", { status: 404 });
  const clean = new URL(req.url).searchParams.get("clean") === "1";
  const html = renderEmailDocument(toMeta(row), await designRenderContext({ preview: !clean }));
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex", "Content-Security-Policy": "script-src 'none'" } });
}

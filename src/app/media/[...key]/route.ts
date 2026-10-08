import { db } from "@/lib/db";

/** Serves images stored in PostgreSQL (fallback when no S3 bucket is configured). */
export async function GET(_req: Request, ctx: { params: Promise<{ key: string[] }> }) {
  const { key } = await ctx.params;
  const blob = await db.mediaBlob.findUnique({ where: { key: key.join("/") } });
  if (!blob) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(blob.data), {
    headers: {
      "Content-Type": blob.mimeType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      ...(blob.mimeType === "image/svg+xml" ? { "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'" } : {}),
    },
  });
}

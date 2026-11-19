import { subscribeShareImageResponse } from "@/lib/newsletter/share-image";

/** Former share image URL (/newsletter/subscribe/ now 308s to /subscribe/). Kept serving the same image so
 * cached Facebook previews of old shares don't break. Drawn in src/lib/newsletter/share-image.tsx. */
export const dynamic = "force-dynamic";

export function GET() {
  return subscribeShareImageResponse();
}

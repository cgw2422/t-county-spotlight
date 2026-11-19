import { subscribeShareImageResponse } from "@/lib/newsletter/share-image";

/** og:image / twitter:image of /subscribe/ (1200×630 PNG). Drawn in src/lib/newsletter/share-image.tsx. */
export const dynamic = "force-dynamic";

export function GET() {
  return subscribeShareImageResponse();
}

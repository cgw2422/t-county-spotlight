import "server-only";
import { db } from "@/lib/db";
import { businessCardSelect } from "@/lib/queries";
import { orgCardSelect } from "@/lib/gives/queries";

export function loadEvent(slug: string) {
  let s = slug;
  try { s = decodeURIComponent(slug); } catch {}
  return db.event.findFirst({
    where: { slug: s.toLowerCase(), status: "PUBLISHED", deletedAt: null },
    include: {
      category: { select: { name: true, slug: true } },
      business: { select: { ...businessCardSelect, status: true, deletedAt: true } },
      organization: { select: { ...orgCardSelect, status: true, deletedAt: true } },
    },
  });
}

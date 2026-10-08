import Link from "next/link";
import { Heart } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { businessHref } from "@/lib/links";
import { formatDate } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { SmartImage } from "@/components/ui/smart-image";
import { OhioMark } from "@/components/site/logo";
import { unfollowAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function FollowingPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  const follows = await db.businessFollow.findMany({
    where: { userId: user.id, business: { deletedAt: null, status: "PUBLISHED" } },
    orderBy: { createdAt: "desc" },
    include: {
      business: {
        select: {
          id: true, slug: true, name: true, city: true, logoUrl: true, coverUrl: true,
          updates: { where: { status: "PUBLISHED" }, orderBy: { createdAt: "desc" }, take: 1, select: { title: true, createdAt: true } },
        },
      },
    },
  });
  if (!follows.length) {
    return (
      <EmptyState icon={Heart} title="You're not following any businesses yet">
        Follow your favorite local spots to see their news and specials.
        <span className="mt-4 flex justify-center"><Link href="/businesses/" className="btn-primary btn-sm">Find local businesses</Link></span>
      </EmptyState>
    );
  }
  return (
    <ul className="card divide-y divide-slate-100">
      {follows.map(({ business: b }) => (
        <li key={b.id} className="flex items-center gap-3 p-3">
          <Link href={businessHref(b)} className="flex min-w-0 flex-1 items-center gap-3">
            <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full bg-navy-800">
              {b.logoUrl || b.coverUrl ? <SmartImage src={(b.logoUrl || b.coverUrl)!} alt="" fill sizes="56px" className="object-cover" /> : <span className="flex h-full w-full items-center justify-center text-white/70"><OhioMark className="h-6 w-6" /></span>}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-semibold text-navy-900">{b.name}</span>
              <span className="block truncate text-sm text-slate-500">
                {b.updates[0] ? `New: ${b.updates[0].title} · ${formatDate(b.updates[0].createdAt, { month: "short", day: "numeric" })}` : b.city || "Tuscarawas County"}
              </span>
            </span>
          </Link>
          <form action={unfollowAction}>
            <input type="hidden" name="businessId" value={b.id} />
            <button type="submit" className="btn-secondary btn-sm">Unfollow</button>
          </form>
        </li>
      ))}
    </ul>
  );
}

import Link from "next/link";
import { SmartImage } from "@/components/ui/smart-image";
import { ImagePlaceholder } from "@/components/ui/placeholder";
import { specialHref } from "@/lib/links";
import { formatDate } from "@/lib/utils";

export type SpecialCardData = {
  id: string; slug: string; title: string; imageUrl?: string | null; endsAt?: Date | null; isFeatured?: boolean; isSponsored?: boolean;
  business: { name: string; logoUrl?: string | null; coverUrl?: string | null };
};

export function SpecialCard({ p }: { p: SpecialCardData }) {
  const img = p.imageUrl || p.business.coverUrl;
  return (
    <Link href={specialHref(p)} className="card card-hover group flex flex-col overflow-hidden">
      <div className="relative aspect-[4/3] overflow-hidden bg-slate-100">
        {img ? <SmartImage src={img} alt="" fill sizes="(min-width:1024px) 25vw, 50vw" className="object-cover transition duration-500 group-hover:scale-105" /> : <ImagePlaceholder label={p.business.name} />}
        <div className="absolute left-3 top-3 flex gap-1.5">
          {p.isSponsored && <span className="badge-sponsored">Sponsored</span>}
          {p.isFeatured && !p.isSponsored && <span className="badge bg-sunset-500 text-white">Featured</span>}
        </div>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="font-semibold leading-snug text-navy-900 group-hover:text-brand-700">{p.title}</h3>
        <p className="mt-1 text-sm text-slate-600">{p.business.name}</p>
        <p className="mt-auto pt-3 text-xs font-medium text-emerald-700">{p.endsAt ? `Valid through ${formatDate(p.endsAt, { month: "short", day: "numeric", year: "numeric" })}` : "Ongoing offer"}</p>
      </div>
    </Link>
  );
}

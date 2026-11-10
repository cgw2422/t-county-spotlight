"use client";
import { useState } from "react";
import Image from "next/image";
import {
  BedDouble, Briefcase, Camera, Car, HeartHandshake, HeartPulse, Palette, Scissors, ShoppingBag, Store, Trees, Utensils, Wrench,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const CATEGORY_ICONS: [RegExp, LucideIcon][] = [
  [/food|dining|restaurant|bakery|cafe|coffee|truck/i, Utensils],
  [/health|wellness|dental|medical|fitness/i, HeartPulse],
  [/auto/i, Car],
  [/beauty|salon|barber|personal care/i, Scissors],
  [/home|service|repair|contract/i, Wrench],
  [/shop|retail|boutique/i, ShoppingBag],
  [/lodging|hotel|inn|stay/i, BedDouble],
  [/art|entertainment|music/i, Palette],
  [/professional|legal|finance|insurance/i, Briefcase],
  [/attraction|recreation|park|outdoor/i, Trees],
  [/photo|media/i, Camera],
  [/nonprofit|community|church/i, HeartHandshake],
];

function initials(name: string) {
  const words = name.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
  return (words.length >= 2 ? words[0][0] + words[1][0] : (words[0] ?? "?").slice(0, 2)).toUpperCase();
}

/** Branded stand-in for a listing without a usable image: initials + category icon. */
export function BusinessImagePlaceholder({ name, category, className }: { name: string; category?: string | null; className?: string }) {
  const Icon = CATEGORY_ICONS.find(([re]) => category && re.test(category))?.[1] ?? Store;
  return (
    <div role="img" aria-label={`${name}${category ? ` — ${category}` : ""}`} className={cn("relative flex h-full w-full items-center justify-center overflow-hidden bg-gradient-to-br from-navy-900 via-navy-800 to-hillside-700", className)}>
      <span aria-hidden className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/5" />
      <span aria-hidden className="pointer-events-none absolute -bottom-8 -left-8 h-28 w-28 rounded-full bg-sunset-500/10" />
      <span aria-hidden className="flex items-center gap-3">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white/10 font-display text-xl font-bold tracking-wide text-white ring-1 ring-white/20">{initials(name)}</span>
        <Icon className="h-7 w-7 text-sunset-400" strokeWidth={1.75} />
      </span>
    </div>
  );
}

/**
 * Business card image area. Photos fill the frame (object-cover, owner focal
 * point); logos/graphics are shown whole (object-contain) so text is never
 * cropped; missing or broken images fall back to the branded placeholder.
 */
export function BusinessCardImage({ name, category, coverUrl, logoUrl, objectPosition, sizes }: {
  name: string; category?: string | null; coverUrl?: string | null; logoUrl?: string | null; objectPosition?: string; sizes: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const photo = coverUrl && coverUrl !== logoUrl && failed !== coverUrl ? coverUrl : null;
  const logo = !photo && logoUrl && failed !== logoUrl ? logoUrl : null;
  const src = photo ?? logo;
  if (!src) return <BusinessImagePlaceholder name={name} category={category} />;
  const unoptimized = src.endsWith(".svg") || src.startsWith("data:");
  return photo ? (
    <Image src={src} alt="" fill sizes={sizes} unoptimized={unoptimized} onError={() => setFailed(src)}
      className="object-cover transition duration-500 group-hover:scale-105" style={objectPosition ? { objectPosition } : undefined} />
  ) : (
    <div className="absolute inset-0 bg-white p-4">
      <div className="relative h-full w-full">
        <Image src={src} alt="" fill sizes={sizes} unoptimized={unoptimized} onError={() => setFailed(src)} className="object-contain" />
      </div>
    </div>
  );
}

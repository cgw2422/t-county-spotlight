import type { Metadata } from "next";
import { getSettings } from "@/lib/settings";
import { absoluteUrl, stripHtml, truncate } from "@/lib/utils";

type MetaInput = {
  title: string;
  description?: string | null;
  /** Canonical path (must end with "/"), e.g. "/businesses/". */
  path: string;
  image?: string | null;
  type?: "website" | "article" | "profile";
  noindex?: boolean;
  publishedTime?: Date | null;
  modifiedTime?: Date | null;
  /** Use the title as-is (skip the "| Site" template). */
  absoluteTitle?: boolean;
};

/** Consistent page metadata: canonical URL, Open Graph and Twitter cards. */
export async function buildMetadata(m: MetaInput): Promise<Metadata> {
  const s = await getSettings();
  const description = truncate(stripHtml(m.description || s.seoDefaultDescription), 300);
  const image = m.image || s.seoDefaultImage;
  const url = absoluteUrl(m.path);
  return {
    title: m.absoluteTitle ? { absolute: m.title } : m.title,
    description,
    alternates: { canonical: url },
    robots: m.noindex ? { index: false, follow: true } : undefined,
    openGraph: {
      type: m.type ?? "website",
      siteName: s.siteName,
      title: m.title,
      description,
      url,
      images: image ? [{ url: absoluteUrl(image) }] : undefined,
      ...(m.type === "article" && m.publishedTime ? { publishedTime: m.publishedTime.toISOString() } : {}),
      ...(m.type === "article" && m.modifiedTime ? { modifiedTime: m.modifiedTime.toISOString() } : {}),
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title: m.title,
      description,
      images: image ? [absoluteUrl(image)] : undefined,
    },
  };
}

/** Build a querystring from a record, dropping empty values. */
export function qs(params: Record<string, string | number | null | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export function param(sp: Record<string, string | string[] | undefined>, key: string) {
  const v = sp[key];
  return (Array.isArray(v) ? v[0] : v)?.trim() || "";
}

export function pageParam(sp: Record<string, string | string[] | undefined>) {
  const n = parseInt(param(sp, "page"), 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 1000) : 1;
}

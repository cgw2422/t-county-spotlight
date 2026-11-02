import type { MetadataRoute } from "next";
import { getSettings } from "@/lib/settings";
import { getBrandAssetUrls } from "@/lib/brand-assets";

export const dynamic = "force-dynamic";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const [s, b] = await Promise.all([getSettings(), getBrandAssetUrls()]);
  return {
    id: "/",
    name: s.pwaName,
    short_name: s.pwaShortName,
    description: s.description,
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    theme_color: s.pwaThemeColor,
    background_color: s.pwaBackgroundColor,
    lang: "en-US",
    categories: ["news", "lifestyle", "shopping", "travel"],
    icons: [
      { src: b.icon192, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: b.icon512, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: b.maskable512, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Events", short_name: "Events", url: "/events/?source=pwa-shortcut", icons: [{ src: b.icon192, sizes: "192x192" }] },
      { name: "Specials", short_name: "Specials", url: "/specials/?source=pwa-shortcut", icons: [{ src: b.icon192, sizes: "192x192" }] },
      { name: "Businesses", short_name: "Businesses", url: "/businesses/?source=pwa-shortcut", icons: [{ src: b.icon192, sizes: "192x192" }] },
    ],
  };
}

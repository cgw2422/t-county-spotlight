import type { Metadata, Viewport } from "next";
import Link from "next/link";
// Brand typography: Montserrat Bold (headings, navigation, labels) + Open Sans (body)
import "@fontsource/montserrat/700.css";
import "@fontsource/montserrat/800.css";
import "@fontsource/open-sans/400.css";
import "@fontsource/open-sans/400-italic.css";
import "@fontsource/open-sans/600.css";
import "@fontsource/open-sans/700.css";
import "./globals.css";
import { getSettings } from "@/lib/settings";
import { absoluteUrl } from "@/lib/utils";
import { ServiceWorkerRegister } from "@/components/site/sw-register";
import { getBrandAssetUrls } from "@/lib/brand-assets";
import { getRequestTheme } from "@/lib/seasonal-theme";

export async function generateMetadata(): Promise<Metadata> {
  const [s, brand] = await Promise.all([getSettings(), getBrandAssetUrls()]);
  const ogImage = s.seoDefaultImage || brand.og;
  return {
    metadataBase: new URL(absoluteUrl("/")),
    title: { default: s.seoDefaultTitle, template: `%s | ${s.siteName}` },
    description: s.seoDefaultDescription,
    applicationName: s.pwaName,
    manifest: "/manifest.webmanifest",
    icons: {
      icon: brand.hasOfficialLogo || !s.faviconUrl
        ? [{ url: brand.icon32, sizes: "32x32", type: "image/png" }, { url: brand.icon48, sizes: "48x48", type: "image/png" }, { url: brand.icon192, sizes: "192x192", type: "image/png" }]
        : [{ url: s.faviconUrl }],
      apple: [{ url: brand.appleTouch, sizes: "180x180" }],
    },
    appleWebApp: { capable: true, title: s.pwaShortName, statusBarStyle: "default" },
    openGraph: {
      type: "website",
      siteName: s.siteName,
      title: s.seoDefaultTitle,
      description: s.seoDefaultDescription,
      images: ogImage ? [{ url: ogImage, width: 1200, height: 630, alt: s.siteName }] : undefined,
    },
    twitter: { card: "summary_large_image", images: ogImage ? [ogImage] : undefined },
  };
}

export async function generateViewport(): Promise<Viewport> {
  const s = await getSettings();
  return { themeColor: s.pwaThemeColor, width: "device-width", initialScale: 1, viewportFit: "cover" };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Seasonal theme (Admin → Homepage → Seasonal themes): computed per request from the
  // published settings (or a staff draft preview). Null = normal brand look, no data-season.
  const theme = await getRequestTheme();
  return (
    <html lang="en" data-season={theme?.season} style={theme?.style as React.CSSProperties | undefined}>
      <body className="min-h-dvh">
        {theme?.preview && (
          <div role="status" data-testid="season-preview-banner" className="relative z-[60] flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-sunset-500 px-4 py-2 text-center text-sm font-semibold text-navy-900">
            <span>{theme.preview.label}</span>
            <Link href="/admin/homepage/appearance/seasons/" className="underline" target="_top">Seasonal themes</Link>
          </div>
        )}
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:shadow-lg">Skip to content</a>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}

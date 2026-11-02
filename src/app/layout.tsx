import type { Metadata, Viewport } from "next";
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

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-dvh">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:shadow-lg">Skip to content</a>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}

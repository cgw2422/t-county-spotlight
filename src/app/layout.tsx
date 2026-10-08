import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "@fontsource/fraunces/600.css";
import "@fontsource/fraunces/700.css";
import "@fontsource/fraunces/400-italic.css";
import "./globals.css";
import { getSettings } from "@/lib/settings";
import { absoluteUrl } from "@/lib/utils";
import { ServiceWorkerRegister } from "@/components/site/sw-register";

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSettings();
  return {
    metadataBase: new URL(absoluteUrl("/")),
    title: { default: s.seoDefaultTitle, template: `%s | ${s.siteName}` },
    description: s.seoDefaultDescription,
    applicationName: s.pwaName,
    manifest: "/manifest.webmanifest",
    icons: {
      icon: s.faviconUrl ? [{ url: s.faviconUrl }] : [{ url: "/icons/icon.svg", type: "image/svg+xml" }],
      apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
    },
    appleWebApp: { capable: true, title: s.pwaShortName, statusBarStyle: "default" },
    openGraph: {
      type: "website",
      siteName: s.siteName,
      title: s.seoDefaultTitle,
      description: s.seoDefaultDescription,
      images: s.seoDefaultImage ? [s.seoDefaultImage] : undefined,
    },
    twitter: { card: "summary_large_image" },
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

import "server-only";
import { ImageResponse } from "next/og";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { getSettings } from "@/lib/settings";
import { effectiveBrandLogoUrl, renderBrandAsset } from "@/lib/brand-assets";
import { BRAND, DEFAULT_BRAND_LOGO_URL } from "@/lib/brand";
import { SUBSCRIBE_PAGE, SUBSCRIBE_PATH } from "@/lib/newsletter/copy";

/**
 * Facebook / link share preview for /subscribe/ (og:image + twitter:image, 1200×630 PNG):
 * the official logo on brand colors with the page heading, drawn with next/og ImageResponse.
 * Served by route handlers at /subscribe/share-image.png (the page's og:image) and at the former
 * /newsletter/subscribe/share-image.png (so cached Facebook previews of the old URL keep working).
 * A route at a path with a file extension rather than the opengraph-image file convention: with
 * trailingSlash: true the convention's extension-less URL answers 308 before the image, while a path
 * with a file extension is served directly (like /brand/logo.png).
 */
export const SHARE_IMAGE_SIZE = { width: 1200, height: 630 };

async function logoDataUrl() {
  let png: Buffer;
  try {
    const s = await getSettings();
    png = await renderBrandAsset("logo.png", effectiveBrandLogoUrl(s), s.brandIconUrl);
  } catch {
    // Bundled original artwork (never redrawn).
    png = await sharp(await fs.readFile(path.join(process.cwd(), "public", DEFAULT_BRAND_LOGO_URL))).resize({ width: 960 }).png().toBuffer();
  }
  const meta = await sharp(png).metadata();
  return { src: `data:image/png;base64,${png.toString("base64")}`, ratio: (meta.width || 3) / (meta.height || 1) };
}

async function font(file: string) {
  try {
    return await fs.readFile(path.join(process.cwd(), "node_modules", "@fontsource", file));
  } catch {
    return null;
  }
}

/** The share image response. The logo can be replaced in Admin → Settings, so callers render on request (cached for an hour). */
export async function subscribeShareImageResponse() {
  const [logo, montserrat, openSans] = await Promise.all([
    logoDataUrl(),
    font("montserrat/files/montserrat-latin-700-normal.woff"),
    font("open-sans/files/open-sans-latin-400-normal.woff"),
  ]);
  const host = (() => {
    try { return new URL(process.env.APP_URL || "https://tcountyconnect.com").host; } catch { return "tcountyconnect.com"; }
  })();
  const logoW = 470;
  const { navy, orange, offWhite, green } = BRAND.colors;
  const fonts = [
    ...(montserrat ? [{ name: "Montserrat", data: montserrat, weight: 700 as const, style: "normal" as const }] : []),
    ...(openSans ? [{ name: "Open Sans", data: openSans, weight: 400 as const, style: "normal" as const }] : []),
  ];
  const res = new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: offWhite, fontFamily: "Open Sans" }}>
        <div style={{ display: "flex", height: 14, width: "100%", background: orange }} />
        <div style={{ display: "flex", flex: 1, flexDirection: "column", justifyContent: "center", padding: "0 80px" }}>
          <div style={{ display: "flex", alignSelf: "flex-start", padding: "18px 26px", borderRadius: 24, background: "#ffffff", border: "2px solid rgba(11,35,64,0.08)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- next/og ImageResponse needs a plain img */}
            <img src={logo.src} width={logoW} height={Math.round(logoW / logo.ratio)} alt="" />
          </div>
          <div style={{ display: "flex", marginTop: 40, fontFamily: "Montserrat", fontSize: 66, lineHeight: 1.1, color: navy, letterSpacing: -1 }}>{SUBSCRIBE_PAGE.heading}</div>
          <div style={{ display: "flex", marginTop: 22, fontSize: 32, lineHeight: 1.35, color: "#334155", maxWidth: 960 }}>{SUBSCRIBE_PAGE.description}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 96, padding: "0 80px", background: navy, color: "#ffffff" }}>
          <div style={{ display: "flex", fontFamily: "Montserrat", fontSize: 30, color: "#ffffff" }}>{`${host}${SUBSCRIBE_PATH}`}</div>
          <div style={{ display: "flex", alignItems: "center", padding: "12px 28px", borderRadius: 999, background: orange, color: navy, fontFamily: "Montserrat", fontSize: 28 }}>{SUBSCRIBE_PAGE.button}</div>
        </div>
        <div style={{ display: "flex", height: 8, width: "100%", background: green }} />
      </div>
    ),
    { ...SHARE_IMAGE_SIZE, fonts: fonts.length ? fonts : undefined },
  );
  res.headers.set("Cache-Control", "public, max-age=3600, s-maxage=3600");
  return res;
}

import { NextResponse } from "next/server";
import { getSettings } from "@/lib/settings";
import { BRAND_ASSETS, brandAssetUrl, effectiveBrandLogoUrl, brandVersion, renderBrandAsset, type BrandAssetName } from "@/lib/brand-assets";

export const dynamic = "force-dynamic";

/** Serves logo / favicon / PWA icon / social image variants generated from the official logo. */
export async function GET(req: Request, ctx: { params: Promise<{ asset: string }> }) {
  const { asset } = await ctx.params;
  if (!(asset in BRAND_ASSETS)) return new NextResponse("Not found", { status: 404 });
  const settings = await getSettings();
  const s = { ...settings, brandLogoUrl: effectiveBrandLogoUrl(settings) };
  if (!s.brandLogoUrl) {
    // Until the official artwork is uploaded, icons fall back to neutral static files.
    const fallback = brandAssetUrl(asset as BrandAssetName, null);
    if (fallback) return NextResponse.redirect(new URL(fallback, req.url), { status: 307, headers: { "Cache-Control": "no-store" } });
    return new NextResponse("Official logo not uploaded yet", { status: 404 });
  }
  try {
    const buf = await renderBrandAsset(asset as BrandAssetName, s.brandLogoUrl, s.brandIconUrl);
    const versioned = new URL(req.url).searchParams.get("v") === brandVersion(s.brandLogoUrl, s.brandIconUrl);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": versioned ? "public, max-age=31536000, immutable" : "public, max-age=300",
      },
    });
  } catch (e) {
    console.error("[brand] asset generation failed", e);
    return new NextResponse("Brand asset unavailable", { status: 500 });
  }
}

import { brandAssetUrl, type BrandAssetName } from "@/lib/brand-assets";

const PREVIEWS: { asset: BrandAssetName; label: string; box: string }[] = [
  { asset: "logo-sm.png", label: "Header / email logo", box: "col-span-2 h-16" },
  { asset: "mark.png", label: "Icon mark", box: "h-16" },
  { asset: "icon-192.png", label: "App icon", box: "h-16" },
  { asset: "maskable-512.png", label: "Android adaptive", box: "h-16" },
  { asset: "apple-touch-icon.png", label: "Apple touch icon", box: "h-16" },
  { asset: "icon-32.png", label: "Favicon", box: "h-8" },
  { asset: "og.png", label: "Social sharing (1200×630)", box: "col-span-2 h-24" },
];

/** Shows the assets generated from the uploaded official logo. */
export function BrandAssetPreview({ brandLogoUrl, brandIconUrl }: { brandLogoUrl: string; brandIconUrl?: string | null }) {
  return (
    <div className="mt-4">
      <p className="text-sm font-semibold text-navy-900">Generated from your logo</p>
      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {PREVIEWS.map((p) => {
          const src = brandAssetUrl(p.asset, brandLogoUrl, brandIconUrl)!;
          return (
            <a key={p.asset} href={src} target="_blank" rel="noreferrer" className={`flex flex-col gap-1 rounded-lg border border-slate-200 bg-white p-2 ${p.box.includes("col-span-2") ? "col-span-2" : ""}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={p.label} className={`${p.box.replace("col-span-2 ", "")} w-full object-contain`} />
              <span className="text-xs text-slate-500">{p.label}</span>
            </a>
          );
        })}
      </div>
      <p className="help mt-2">If the icon mark looks wrong, upload a higher-resolution original with a plain white or transparent background, or add the separate icon mark above.</p>
    </div>
  );
}

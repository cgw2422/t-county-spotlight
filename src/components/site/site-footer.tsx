import Link from "next/link";
import { getSettings } from "@/lib/settings";
import { Logo } from "./logo";
import { getBrandAssetUrls } from "@/lib/brand-assets";
import { getMenu } from "./nav-data";
import { NewsletterSignup } from "@/components/newsletter/newsletter-signup";

/** Site footer on navy with the official all-white logo. */
export async function SiteFooter() {
  const [s, footer, header, brand] = await Promise.all([getSettings(), getMenu("FOOTER"), getMenu("HEADER"), getBrandAssetUrls()]);
  const socials = Object.entries(s.socials || {}).filter(([, v]) => v);
  const link = "rounded-sm text-white underline-offset-4 hover:underline focus-visible:outline-white";
  return (
    <footer className="mt-16 bg-navy-950 pb-[calc(5rem+var(--safe-bottom))] text-white lg:pb-0">
      <div className="border-b border-white/10">
        <div className="container-page max-w-3xl py-10">
          <NewsletterSignup source="footer" variant="compact" tone="dark" />
        </div>
      </div>
      <div className="container-page grid gap-10 py-12 md:grid-cols-4">
        <div className="md:col-span-2">
          <Logo src={brand.logoWhiteSmall} onDark plate={false} size="lg" className="max-w-full" loading="lazy" />
          <p className="mt-5 max-w-md text-sm leading-relaxed text-white">{s.footerText}</p>
          {socials.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm">
              {socials.map(([k, v]) => (
                <li key={k}><a href={v as string} target="_blank" rel="noopener noreferrer" className={`capitalize ${link}`}>{k}</a></li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h2 className="font-display text-sm font-bold uppercase tracking-wider text-white">Explore</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {header.filter((i) => i.href !== "/").map((i) => <li key={i.href}><Link href={i.href} className={link}>{i.label}</Link></li>)}
          </ul>
        </div>
        <div>
          <h2 className="font-display text-sm font-bold uppercase tracking-wider text-white">T County Connect</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {footer.map((i) => <li key={i.href}><Link href={i.href} className={link}>{i.label}</Link></li>)}
          </ul>
          {(s.contactEmail || s.contactPhone) && (
            <p className="mt-4 text-sm text-white">{s.contactEmail}<br />{s.contactPhone}</p>
          )}
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="container-page flex flex-col gap-2 py-6 text-xs text-white sm:flex-row sm:justify-between">
          <p>© {new Date().getFullYear()} {s.siteName}. Proudly serving Tuscarawas County, Ohio.</p>
          <p>Sponsored content is always labeled. Editorial spotlights are never for sale.</p>
        </div>
      </div>
    </footer>
  );
}

import Link from "next/link";
import { getSettings } from "@/lib/settings";
import { Logo } from "./logo";
import { getMenu } from "./nav-data";

export async function SiteFooter() {
  const [s, footer, header] = await Promise.all([getSettings(), getMenu("FOOTER"), getMenu("HEADER")]);
  const socials = Object.entries(s.socials || {}).filter(([, v]) => v);
  return (
    <footer className="mt-16 bg-navy-950 pb-24 text-slate-300 lg:pb-0">
      <div className="container-page grid gap-10 py-12 md:grid-cols-4">
        <div className="md:col-span-2">
          <Logo logoUrl={s.logoDarkUrl || s.logoUrl} siteName={s.siteName} invert />
          <p className="mt-4 max-w-md text-sm leading-relaxed">{s.footerText}</p>
          {socials.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-3 text-sm">
              {socials.map(([k, v]) => (
                <li key={k}><a href={v as string} target="_blank" rel="noopener noreferrer" className="capitalize hover:text-white">{k}</a></li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-white">Explore</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {header.filter((i) => i.href !== "/").map((i) => <li key={i.href}><Link href={i.href} className="hover:text-white">{i.label}</Link></li>)}
          </ul>
        </div>
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-white">TCountySpotlight</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {footer.map((i) => <li key={i.href}><Link href={i.href} className="hover:text-white">{i.label}</Link></li>)}
          </ul>
          {(s.contactEmail || s.contactPhone) && (
            <p className="mt-4 text-sm">{s.contactEmail}<br />{s.contactPhone}</p>
          )}
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="container-page flex flex-col gap-2 py-6 text-xs sm:flex-row sm:justify-between">
          <p>© {new Date().getFullYear()} {s.siteName}. Proudly serving Tuscarawas County, Ohio.</p>
          <p>Sponsored content is always labeled. Editorial spotlights are never for sale.</p>
        </div>
      </div>
    </footer>
  );
}

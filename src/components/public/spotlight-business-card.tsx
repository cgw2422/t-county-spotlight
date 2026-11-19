import Link from "next/link";
import { ArrowRight, Clock, Globe, MapPin, Phone } from "lucide-react";
import { SmartImage } from "@/components/ui/smart-image";
import { businessHref } from "@/lib/links";
import { cn } from "@/lib/utils";
import { DAY_NAMES, format12, nyNow, openStatus, parseHours } from "./hours";
import { TrackedLink } from "./track";

export type SpotlightBusiness = {
  id: string; slug: string; name: string; logoUrl: string | null; city: string | null; state: string | null; zip: string | null;
  address: string | null; phone: string | null; website: string | null; hours: unknown; categories: { name: string }[];
};

/** Same normalization as the business profile page. */
function websiteUrl(w: string | null) {
  if (!w) return null;
  const url = /^https?:\/\//i.test(w) ? w : `https://${w}`;
  try { return new URL(url); } catch { return null; }
}

/**
 * Compact "About the Business" card beside a Business Spotlight story. Every field comes live from
 * the linked Business record and mirrors what the public profile shows (phone when set, website
 * when it parses, street address when set, hours via the profile's helpers). Missing fields are
 * simply omitted.
 */
export function SpotlightBusinessCard({ b, now = new Date() }: { b: SpotlightBusiness; now?: Date }) {
  const href = businessHref(b);
  const hours = parseHours(b.hours);
  const status = openStatus(hours, now);
  const today = nyNow(now).day;
  const site = websiteUrl(b.website);
  const tel = b.phone ? b.phone.replace(/[^\d+]/g, "") : null;
  const addressLine2 = [b.city, [b.state, b.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const category = b.categories.map((c) => c.name).slice(0, 2).join(" · ");
  const track = (type: string) => ({ type, businessId: b.id, targetType: "BUSINESS", targetId: b.id });
  const headingId = `spotlight-biz-${b.id}`;

  return (
    <section aria-labelledby={headingId} data-testid="spotlight-business-card" className="card p-5">
      <div className="flex items-center gap-4">
        {b.logoUrl && (
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
            <SmartImage src={b.logoUrl} alt={`${b.name} logo`} fill sizes="64px" className="object-contain p-1" />
          </div>
        )}
        <div className="min-w-0">
          <h3 id={headingId} data-field="name" className="font-display text-lg font-bold leading-snug text-navy-900">{b.name}</h3>
          {category && <p data-field="category" className="text-sm text-slate-600">{category}</p>}
          {b.city && <p data-field="city" className="mt-0.5 flex items-center gap-1 text-sm text-slate-600"><MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />{b.city}</p>}
        </div>
      </div>

      {(b.address || tel || site || status) && (
        <ul className="mt-4 space-y-2.5 border-t border-slate-100 pt-4 text-sm">
          {b.address && (
            <li data-field="address" className="flex gap-3">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
              <address className="not-italic text-slate-700">{b.address}{addressLine2 && <><br />{addressLine2}</>}</address>
            </li>
          )}
          {b.phone && tel && (
            <li data-field="phone" className="flex gap-3">
              <Phone className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
              <TrackedLink href={`tel:${tel}`} track={track("click_phone")} className="text-slate-700 hover:text-brand-700">{b.phone}</TrackedLink>
            </li>
          )}
          {site && (
            <li data-field="website" className="flex min-w-0 gap-3">
              <Globe className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
              <TrackedLink href={site.toString()} target="_blank" rel="noopener" track={track("click_website")} className="truncate text-brand-700 hover:underline">{site.hostname.replace(/^www\./, "")}</TrackedLink>
            </li>
          )}
          {status && (
            <li data-field="hours" className="flex gap-3">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
              <details className="group min-w-0 flex-1">
                <summary className="cursor-pointer list-none text-slate-700 [&::-webkit-details-marker]:hidden">
                  <span className={cn("font-semibold", status.open ? "text-emerald-700" : "text-slate-600")}>{status.label}</span>
                  <span className="ml-1.5 text-brand-700 underline-offset-2 group-open:hidden hover:underline">Hours</span>
                </summary>
                <table className="mt-2 w-full text-sm">
                  <caption className="sr-only">Opening hours (Eastern Time)</caption>
                  <tbody>
                    {hours.map((h) => (
                      <tr key={h.day} className={cn(h.day === today && "font-semibold text-navy-900")}>
                        <th scope="row" className="py-1 pr-3 text-left font-[inherit]">{DAY_NAMES[h.day]}{h.day === today && <span className="sr-only"> (today)</span>}</th>
                        <td className="py-1 text-right text-slate-700">{h.closed ? "Closed" : `${format12(h.open)} – ${format12(h.close)}`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </li>
          )}
        </ul>
      )}

      <Link href={href} data-testid="view-business-listing" className="btn-primary mt-5 w-full">
        View Business Listing <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </section>
  );
}

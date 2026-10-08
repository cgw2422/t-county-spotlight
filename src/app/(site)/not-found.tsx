import Link from "next/link";
import { CalendarDays, Newspaper, Store, Tag } from "lucide-react";
import { SearchBox } from "@/components/public/search-box";

export default function NotFound() {
  const links = [
    { href: "/businesses/", label: "Local businesses", icon: Store },
    { href: "/events/", label: "Upcoming events", icon: CalendarDays },
    { href: "/specials/", label: "Local specials", icon: Tag },
    { href: "/articles/", label: "Stories & news", icon: Newspaper },
  ];
  return (
    <section className="container-page py-16 sm:py-24">
      <div className="mx-auto max-w-2xl text-center">
        <p className="eyebrow">Error 404</p>
        <h1 className="mt-2 font-display text-4xl font-bold text-navy-900 sm:text-5xl">We couldn&rsquo;t find that page</h1>
        <p className="mt-4 text-lg text-slate-600">The link may be outdated or the page may have moved. Try a search, or explore what&rsquo;s happening around Tuscarawas County.</p>
        <div className="mx-auto mt-8 max-w-xl">
          <SearchBox action="/search/" placeholder="Search businesses, events, stories…" id="nf-q" size="lg" />
        </div>
        <ul className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {links.map(({ href, label, icon: Icon }) => (
            <li key={href}>
              <Link href={href} className="card card-hover flex h-full flex-col items-center gap-2 p-4 text-sm font-semibold text-navy-900">
                <Icon className="h-6 w-6 text-brand-600" aria-hidden />
                {label}
              </Link>
            </li>
          ))}
        </ul>
        <Link href="/" className="btn-primary mt-10">Back to the homepage</Link>
      </div>
    </section>
  );
}

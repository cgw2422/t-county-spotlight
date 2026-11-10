import Link from "next/link";
import { MapPin, Search, UserRound } from "lucide-react";
import { getSettings } from "@/lib/settings";
import { getSessionUser, isStaff } from "@/lib/auth";
import { Logo } from "./logo";
import { getBrandAssetUrls } from "@/lib/brand-assets";
import { getMenu } from "./nav-data";
import { MobileMenu } from "./mobile-menu";
import { NavLinks } from "./nav-links";

export async function SiteHeader() {
  const [settings, items, mobileItems, user, brand] = await Promise.all([getSettings(), getMenu("HEADER"), getMenu("MOBILE"), getSessionUser(), getBrandAssetUrls()]);
  const accountHref = !user ? "/login" : user.mustChangePassword ? "/account/password/?required=1" : isStaff(user) ? "/admin" : user.role === "BUSINESS_OWNER" ? "/dashboard" : "/account";
  return (
    <>
      {settings.bannerEnabled && settings.bannerText && (
        <div className="bg-navy-900 pt-safe text-center text-sm text-white">
          <div className="container-page py-2">
            {settings.bannerLink ? <Link href={settings.bannerLink} className="underline-offset-2 hover:underline">{settings.bannerText}</Link> : settings.bannerText}
          </div>
        </div>
      )}
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 pt-safe backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="container-page flex h-16 items-center gap-4 lg:h-[72px]">
          <Logo src={brand.logoSmall ?? brand.logo} />
          <nav aria-label="Main" className="ml-6 hidden flex-1 xl:block">
            <NavLinks items={items} />
          </nav>
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <Link href="/search" className="btn-ghost px-3" aria-label="Search">
              <Search className="h-5 w-5" />
            </Link>
            {/* Phones/tablets reach My T County from the bottom nav. */}
            <Link href="/my-t-county/" className="btn-ghost hidden px-3 lg:inline-flex" aria-label="My T County" title="My T County">
              <MapPin className="h-5 w-5" />
            </Link>
            {user ? (
              <Link href={accountHref} className="btn-ghost hidden px-3 sm:inline-flex">
                <UserRound className="h-5 w-5" /> <span className="hidden xl:inline">{user.name?.split(" ")[0] || "Account"}</span>
              </Link>
            ) : (
              <Link href="/login" className="btn-primary hidden sm:inline-flex">Sign In</Link>
            )}
            <MobileMenu items={mobileItems} signedIn={!!user} accountHref={accountHref} />
          </div>
        </div>
      </header>
    </>
  );
}

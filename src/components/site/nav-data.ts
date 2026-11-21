import { db } from "@/lib/db";

export type NavItem = { label: string; href: string; newTab?: boolean };

export const DEFAULT_HEADER_NAV: NavItem[] = [
  { label: "Home", href: "/" },
  { label: "Businesses", href: "/businesses" },
  { label: "Events", href: "/events" },
  { label: "Specials", href: "/specials" },
  { label: "Things to Do", href: "/things-to-do" },
  { label: "Jobs", href: "/jobs" },
  { label: "Articles", href: "/articles" },
];

export const DEFAULT_FOOTER_NAV: NavItem[] = [
  { label: "About", href: "/about" },
  { label: "List Your Business", href: "/list-your-business" },
  { label: "Get Listed", href: "/add-your-business" },
  { label: "Recommend a Business", href: "/recommend-a-business" },
  { label: "Submit an Event", href: "/events/submit" },
  { label: "Newsletter", href: "/subscribe" },
  { label: "Contact", href: "/contact" },
];

/** Phone menu fallback: the header links plus the newsletter signup (grouped under "Community"). */
export const DEFAULT_MOBILE_NAV: NavItem[] = [...DEFAULT_HEADER_NAV, { label: "Newsletter", href: "/subscribe" }];

export async function getMenu(location: "HEADER" | "FOOTER" | "MOBILE"): Promise<NavItem[]> {
  try {
    const items = await db.menuItem.findMany({ where: { location, isVisible: true, parentId: null }, orderBy: { sortOrder: "asc" } });
    if (items.length) return items.map((i) => ({ label: i.label, href: i.href, newTab: i.openInNewTab }));
  } catch {}
  if (location === "FOOTER") return DEFAULT_FOOTER_NAV;
  if (location === "MOBILE") return DEFAULT_MOBILE_NAV;
  return DEFAULT_HEADER_NAV;
}

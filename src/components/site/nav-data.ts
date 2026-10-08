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
  { label: "Memberships", href: "/memberships" },
  { label: "Submit an Event", href: "/events/submit" },
  { label: "Contact", href: "/contact" },
  { label: "Privacy", href: "/privacy" },
];

export async function getMenu(location: "HEADER" | "FOOTER" | "MOBILE"): Promise<NavItem[]> {
  try {
    const items = await db.menuItem.findMany({ where: { location, isVisible: true, parentId: null }, orderBy: { sortOrder: "asc" } });
    if (items.length) return items.map((i) => ({ label: i.label, href: i.href, newTab: i.openInNewTab }));
  } catch {}
  if (location === "FOOTER") return DEFAULT_FOOTER_NAV;
  return DEFAULT_HEADER_NAV;
}

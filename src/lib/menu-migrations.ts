/**
 * One-time menu updates run by prisma/seed.ts. Each is guarded by a Setting marker, so it runs once per
 * database and never again — later edits in Admin → Menus always win.
 */
import type { PrismaClient } from "../generated/prisma/client";

const NEWSLETTER_MARKER = "menuNewsletterSubscribe";
export const NEWSLETTER_MENU_ITEM = { label: "Newsletter", href: "/subscribe/" } as const;
/** Labels the footer's newsletter (archive) link was seeded with. Anything else counts as an admin's own wording. */
const SEEDED_FOOTER_LABELS = ["T County Connect Weekly", "Newsletter"];
const SUBSCRIBE_HREFS = ["/subscribe/", "/subscribe"];
const ARCHIVE_HREFS = ["/newsletter/", "/newsletter"];

/**
 * "Newsletter" → /subscribe/ in the phone menu and the footer:
 *   MOBILE: appended when no item points to /subscribe/.
 *   FOOTER: nothing when an item already points to /subscribe/; else the seeded archive link
 *           (/newsletter/ labelled "T County Connect Weekly" or "Newsletter") becomes "Newsletter" → /subscribe/
 *           (an archive link can be re-added in Admin → Menus); else appended.
 * Other items are never touched.
 */
export async function runNewsletterMenuMigration(db: PrismaClient, log: (m: string) => void = console.log) {
  if (await db.setting.findUnique({ where: { key: NEWSLETTER_MARKER } })) return { skipped: true as const, changes: [] as string[] };
  const changes: string[] = [];
  const append = async (location: "MOBILE" | "FOOTER") => {
    const last = await db.menuItem.aggregate({ where: { location, parentId: null }, _max: { sortOrder: true } });
    await db.menuItem.create({ data: { location, ...NEWSLETTER_MENU_ITEM, sortOrder: (last._max.sortOrder ?? -1) + 1 } });
    changes.push(`${location}: appended`);
  };

  if (!(await db.menuItem.findFirst({ where: { location: "MOBILE", href: { in: SUBSCRIBE_HREFS } } }))) await append("MOBILE");

  if (!(await db.menuItem.findFirst({ where: { location: "FOOTER", href: { in: SUBSCRIBE_HREFS } } }))) {
    const seeded = await db.menuItem.findFirst({
      where: { location: "FOOTER", href: { in: ARCHIVE_HREFS }, label: { in: SEEDED_FOOTER_LABELS } },
      orderBy: { sortOrder: "asc" },
    });
    if (seeded) {
      await db.menuItem.update({ where: { id: seeded.id }, data: NEWSLETTER_MENU_ITEM });
      changes.push(`FOOTER: "${seeded.label}" ${seeded.href} → "${NEWSLETTER_MENU_ITEM.label}" ${NEWSLETTER_MENU_ITEM.href}`);
    } else {
      await append("FOOTER");
    }
  }

  const value = { at: new Date().toISOString(), changes };
  await db.setting.create({ data: { key: NEWSLETTER_MARKER, value } });
  log(`[menus] newsletter signup link: ${changes.join("; ") || "already present"}`);
  return { skipped: false as const, changes };
}

const GET_LISTED_MARKER = "menuGetListed";
export const GET_LISTED_LABEL = "Get Listed";
const GET_LISTED_HREFS = ["/memberships/", "/memberships"];
/** Labels the /memberships/ link was seeded with. Anything else counts as an admin's own wording and is left alone. */
const SEEDED_MEMBERSHIP_LABELS = ["Memberships", "Membership", "Business Memberships"];

/**
 * Public menus: links to /memberships/ (URL unchanged) still carrying a seeded "Memberships" label become "Get Listed",
 * in every menu location. Custom labels and all other items are never touched.
 */
export async function runGetListedMenuMigration(db: PrismaClient, log: (m: string) => void = console.log) {
  if (await db.setting.findUnique({ where: { key: GET_LISTED_MARKER } })) return { skipped: true as const, count: 0 };
  const r = await db.menuItem.updateMany({ where: { href: { in: GET_LISTED_HREFS }, label: { in: SEEDED_MEMBERSHIP_LABELS } }, data: { label: GET_LISTED_LABEL } });
  await db.setting.create({ data: { key: GET_LISTED_MARKER, value: { at: new Date().toISOString(), renamed: r.count } } });
  log(`[menus] "Memberships" → "${GET_LISTED_LABEL}": ${r.count} link(s)`);
  return { skipped: false as const, count: r.count };
}

const ADD_YOUR_BUSINESS_MARKER = "menuAddYourBusiness";
export const RECOMMEND_MENU_ITEM = { label: "Recommend a Business", href: "/recommend-a-business/" } as const;

/**
 * The Get Listed page moved from /memberships/ to /add-your-business/ (the old URL 301-redirects):
 *   - every menu link to /memberships/ now points to /add-your-business/ (labels unchanged);
 *   - saved redirects that send old URLs to /memberships/ go straight to /add-your-business/ (no double hop);
 *   - "Recommend a Business" is appended to the footer when no footer link points to it.
 * Runs once (marker); later edits in Admin → Menus / Redirects always win.
 */
export async function runAddYourBusinessMenuMigration(db: PrismaClient, log: (m: string) => void = console.log) {
  if (await db.setting.findUnique({ where: { key: ADD_YOUR_BUSINESS_MARKER } })) return { skipped: true as const };
  const old = ["/memberships/", "/memberships"];
  const menus = await db.menuItem.updateMany({ where: { href: { in: old } }, data: { href: "/add-your-business/" } });
  const redirects = await db.redirect.updateMany({ where: { toPath: { in: old } }, data: { toPath: "/add-your-business/" } });
  let footer = false;
  if (!(await db.menuItem.findFirst({ where: { location: "FOOTER", href: { in: [RECOMMEND_MENU_ITEM.href, "/recommend-a-business"] } } }))) {
    const last = await db.menuItem.aggregate({ where: { location: "FOOTER", parentId: null }, _max: { sortOrder: true } });
    await db.menuItem.create({ data: { location: "FOOTER", ...RECOMMEND_MENU_ITEM, sortOrder: (last._max.sortOrder ?? -1) + 1 } });
    footer = true;
  }
  const value = { at: new Date().toISOString(), menuLinks: menus.count, redirects: redirects.count, footerRecommend: footer };
  await db.setting.create({ data: { key: ADD_YOUR_BUSINESS_MARKER, value } });
  log(`[menus] /memberships/ → /add-your-business/: ${menus.count} menu link(s), ${redirects.count} redirect(s); footer "Recommend a Business" ${footer ? "added" : "already present"}`);
  return { skipped: false as const, ...value };
}

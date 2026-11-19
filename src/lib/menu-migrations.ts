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

/**
 * Seeds configuration only (categories, homepage sections, menus, plans,
 * the first admin). It never creates businesses, articles or events —
 * real content comes from the WordPress importer or the admin dashboard.
 * Safe to run repeatedly.
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { runBrandMigration, runNamingMigration } from "../src/lib/brand-migration";
import { runDoubleEncodedRepair, runEntityRepair } from "../src/lib/data-repairs";
import { runMembershipLimitsMigration } from "../src/lib/membership-migration";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

const BUSINESS_CATEGORIES = [
  ["Food & Dining", "food-dining", "utensils"],
  ["Shopping", "shopping", "shopping-bag"],
  ["Health & Wellness", "health-wellness", "heart-pulse"],
  ["Home Services", "home-services", "hammer"],
  ["Automotive", "automotive", "car"],
  ["Professional Services", "professional-services", "briefcase"],
  ["Beauty & Personal Care", "beauty-personal-care", "sparkles"],
  ["Arts & Entertainment", "arts-entertainment", "music"],
  ["Attractions & Recreation", "attractions-recreation", "trees"],
  ["Lodging", "lodging", "bed"],
  ["Nonprofits & Community", "nonprofits-community", "hand-heart"],
  ["Photography & Media", "photography-media", "camera"],
];

const EVENT_CATEGORIES = [
  ["Festivals & Fairs", "festivals-fairs"], ["Live Music", "live-music"], ["Family & Kids", "family-kids"],
  ["Food & Drink", "food-drink"], ["Arts & Culture", "arts-culture"], ["Sports & Outdoors", "sports-outdoors"],
  ["Markets", "markets"], ["Community & Civic", "community-civic"], ["Business & Networking", "business-networking"],
  ["Classes & Workshops", "classes-workshops"],
];

const HOMEPAGE_SECTIONS = [
  { key: "hero", type: "hero", title: "Discover more of T County.", subtitle: null, limit: 0 },
  { key: "explore", type: "explore", title: "Explore T County", subtitle: null, limit: 8 },
  { key: "today", type: "today", title: "What's Happening Today", subtitle: "Events across Tuscarawas County today and tonight", limit: 4 },
  { key: "weekend", type: "weekend", title: "What's Happening This Weekend", subtitle: "Events and activities across the county", limit: 4 },
  { key: "food_trucks", type: "food_trucks", title: "Food Trucks Near You", subtitle: "Scheduled stops from local food trucks", limit: 4 },
  { key: "garage_sales", type: "garage_sales", title: "Garage Sales & Community Markets", subtitle: "Yard sales, rummage sales and markets coming up", limit: 4 },
  { key: "join", type: "join", title: "Make T County Yours.", subtitle: "Save your favorite places, recommend businesses, and stay connected to your community with a free account.", limit: 0 },
  { key: "specials", type: "specials", title: "Local Specials", subtitle: "Deals from participating businesses", limit: 4 },
  { key: "new_coming_soon", type: "new_coming_soon", title: "New & Coming Soon", subtitle: "Businesses opening, moving and growing across T County", limit: 4 },
  { key: "announcements", type: "announcements", title: "Community Updates", subtitle: null, limit: 4 },
  { key: "gives", type: "gives", title: "T County Gives", subtitle: "Find a Cause. Meet a Need. Make a Difference.", limit: 3 },
  { key: "spotlights", type: "spotlights", title: "Local Stories & Business Spotlights", subtitle: "Stories of the people behind T County businesses", limit: 3 },
  { key: "community_pulse", type: "community_pulse", title: "Community Pulse", subtitle: "What people across T County are talking about and recommending", limit: 3 },
  { key: "things_to_do", type: "things_to_do", title: "Things to Do", subtitle: "Attractions, entertainment and family fun", limit: 4 },
  { key: "events", type: "events", title: "Upcoming Community Events", subtitle: null, limit: 6 },
  { key: "businesses", type: "businesses", title: "Featured Local Businesses", subtitle: null, limit: 8 },
  { key: "newsletter", type: "newsletter", title: "Love Local. Stay in the Loop.", subtitle: null, limit: 0 },
  { key: "cta", type: "cta", title: "Own a local business?", subtitle: "Get listed in the Tuscarawas County business directory — free.", limit: 0 },
];

/** The homepage order as originally seeded — only an untouched install gets the new resident-first order. */
const LEGACY_SECTION_ORDER = ["hero", "explore", "weekend", "spotlights", "events", "businesses", "specials", "things_to_do", "announcements", "gives", "newsletter", "cta", "community_pulse"];

const MENU = [
  ["Home", "/"], ["Businesses", "/businesses/"], ["Events", "/events/"], ["Specials", "/specials/"],
  ["Things to Do", "/things-to-do/"], ["T County Gives", "/gives/"], ["Churches", "/churches/"], ["Jobs", "/jobs/"], ["Articles", "/articles/"],
];
const FOOTER = [
  ["List Your Business", "/list-your-business/"], ["Memberships", "/memberships/"], ["Submit an Event", "/events/submit/"],
  ["Business Spotlights", "/spotlights/"], ["T County Connect Weekly", "/newsletter/"], ["Search", "/search/"],
];

async function main() {
  for (const [i, [name, slug, icon]] of BUSINESS_CATEGORIES.entries()) {
    await db.businessCategory.upsert({ where: { slug }, create: { name, slug, icon, sortOrder: i }, update: {} });
  }
  for (const [i, [name, slug]] of EVENT_CATEGORIES.entries()) {
    await db.eventCategory.upsert({ where: { slug }, create: { name, slug, sortOrder: i }, update: {} });
  }
  const hadSections = (await db.homepageSection.count()) > 0;
  for (const [i, s] of HOMEPAGE_SECTIONS.entries()) {
    if (await db.homepageSection.findUnique({ where: { key: s.key } })) continue;
    if (hadSections && s.key === "join") continue; // placed once below (homepageJoinSection)
    // Sections added after launch go to the end of the admin's existing order.
    const max = hadSections ? (await db.homepageSection.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? 0 : -1;
    await db.homepageSection.create({ data: { ...s, sortOrder: hadSections ? max + 1 : i } });
  }
  const isNewInstall = (await db.menuItem.count()) === 0;
  // New sections added after launch: add their menu links once, only if missing.
  if (!isNewInstall) {
    for (const [label, href] of [["T County Gives", "/gives/"], ["Churches", "/churches/"]]) {
      for (const location of ["HEADER", "MOBILE"] as const) {
        if (!(await db.menuItem.findFirst({ where: { location, href } }))) {
          const last = await db.menuItem.aggregate({ where: { location }, _max: { sortOrder: true } });
          await db.menuItem.create({ data: { location, label, href, sortOrder: (last._max.sortOrder ?? 0) + 1 } });
        }
      }
    }
    if (!(await db.menuItem.findFirst({ where: { location: "FOOTER", href: "/newsletter/" } }))) {
      await db.menuItem.create({ data: { location: "FOOTER", label: "T County Connect Weekly", href: "/newsletter/", sortOrder: 99 } });
    }
  }
  if (isNewInstall) {
    await db.menuItem.createMany({ data: MENU.map(([label, href], i) => ({ location: "HEADER" as const, label, href, sortOrder: i })) });
    await db.menuItem.createMany({ data: MENU.map(([label, href], i) => ({ location: "MOBILE" as const, label, href, sortOrder: i })) });
    await db.menuItem.createMany({ data: FOOTER.map(([label, href], i) => ({ location: "FOOTER" as const, label, href, sortOrder: i })) });
  }
  // Community Pulse: footer + mobile menus (the desktop header is already full at 1280px).
  for (const location of ["FOOTER", "MOBILE"] as const) {
    if (!(await db.menuItem.findFirst({ where: { location, href: "/community-pulse/" } }))) {
      const last = await db.menuItem.aggregate({ where: { location }, _max: { sortOrder: true } });
      await db.menuItem.create({ data: { location, label: "Community Pulse", href: "/community-pulse/", sortOrder: (last._max.sortOrder ?? 0) + 1 } });
    }
  }
  // Resident features (Phase 1): mobile + footer menus, appended only if missing.
  for (const [label, href, locations] of [
    ["Food Trucks", "/food-trucks/", ["MOBILE", "FOOTER"]],
    ["Garage Sales", "/garage-sales/", ["MOBILE", "FOOTER"]],
    ["Share Something", "/submit/", ["FOOTER"]],
    ["Communities", "/communities/", ["FOOTER"]],
    ["New & Coming Soon", "/new/", ["FOOTER"]],
  ] as const) {
    for (const location of locations) {
      if (!(await db.menuItem.findFirst({ where: { location, href } }))) {
        const last = await db.menuItem.aggregate({ where: { location }, _max: { sortOrder: true } });
        await db.menuItem.create({ data: { location, label, href, sortOrder: (last._max.sortOrder ?? 0) + 1 } });
      }
    }
  }
  // Proposed plans — inactive until the owner approves pricing in Admin → Memberships.
  const plans = [
    { slug: "free", name: "Free Listing", priceCents: 0, interval: "FREE" as const, sortOrder: 0, isActive: true,
      description: "A standard profile in the T County business directory.",
      features: ["Standard business profile", "Basic contact information", "Business category", "Associated editorial articles"],
      entitlements: { promotions: false, events: true, updates: false, analytics: false, maxPhotos: 3, maxEvents: 3, descriptionLimit: 500, googleReviews: false, servicesMenus: false } },
    { slug: "business-insider", name: "Business Insider", priceCents: 2900, interval: "MONTH" as const, sortOrder: 1, isActive: false,
      description: "Everything you need to stay in front of local customers.",
      features: ["Enhanced business profile", "Expanded photo gallery", "Business-managed promotions", "Event submissions", "Business updates", "Engagement analytics"],
      entitlements: { promotions: true, events: true, updates: true, analytics: true, maxPhotos: 20, maxEvents: null, descriptionLimit: 2000, googleReviews: true, servicesMenus: true } },
    { slug: "founding-business", name: "Founding Business", priceCents: 24900, interval: "YEAR" as const, sortOrder: 2, isActive: false,
      description: "Lock in founding-member pricing for a full year.",
      features: ["All Business Insider features", "Founding Business badge", "Annual billing — two months free"],
      entitlements: { promotions: true, events: true, updates: true, analytics: true, maxPhotos: 20, maxEvents: null, descriptionLimit: 2000, googleReviews: true, servicesMenus: true } },
  ];
  for (const p of plans) await db.membershipPlan.upsert({ where: { slug: p.slug }, create: p, update: {} });

  const products = [
    ["featured-placement", "Featured Business Placement", "featured_placement", 30],
    ["event-sponsorship", "Event Sponsorship", "event_sponsorship", 30],
    ["weekend-guide", "Weekend Guide Sponsorship", "weekend_guide", 7],
    ["job-listing", "Local Job Listing", "job_listing", 30],
    ["category-sponsorship", "Category Sponsorship", "category_sponsorship", 30],
    ["promotional-placement", "Promotional Placement", "promotional_placement", 14],
  ] as const;
  for (const [slug, name, type, durationDays] of products) {
    await db.sponsorshipProduct.upsert({ where: { slug }, create: { slug, name, type, durationDays }, update: {} });
  }

  const email = process.env.ADMIN_EMAIL?.toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (email && password) {
    const existing = await db.user.findUnique({ where: { email } });
    if (!existing) {
      await db.user.create({ data: { email, name: "Site Administrator", role: "ADMIN", passwordHash: await bcrypt.hash(password, 12), emailVerifiedAt: new Date() } });
      console.log(`Created admin ${email}`);
    }
  }
  // Community Pulse categories (created once; admins can rename, reorder or add more)
  const PULSE_CATEGORIES = [
    ["Food & Dining", "food-dining"], ["Automotive", "automotive"], ["Home Services", "home-services"], ["Shopping", "shopping"],
    ["Entertainment", "entertainment"], ["Family & Kids", "family-kids"], ["Health & Wellness", "health-wellness"],
    ["Things to Do", "things-to-do"], ["Community Favorites", "community-favorites"], ["Other", "other"],
  ];
  if ((await db.pulseCategory.count()) === 0) {
    await db.pulseCategory.createMany({ data: PULSE_CATEGORIES.map(([name, slug], i) => ({ name, slug, sortOrder: i })) });
  }
  // One-time: resident-first homepage order, only if the admin never reordered sections.
  if (!(await db.setting.findUnique({ where: { key: "homepageResidentOrder" } }))) {
    const current = (await db.homepageSection.findMany({ orderBy: { sortOrder: "asc" }, select: { key: true } })).map((x) => x.key);
    const legacyNow = current.filter((k) => LEGACY_SECTION_ORDER.includes(k));
    const untouched = legacyNow.length === LEGACY_SECTION_ORDER.length && legacyNow.every((k, i) => k === LEGACY_SECTION_ORDER[i]);
    if (untouched) {
      for (const [i, sec] of HOMEPAGE_SECTIONS.entries()) await db.homepageSection.updateMany({ where: { key: sec.key }, data: { sortOrder: i } });
      // Rename the "announcements" section to "Community Updates" only if it still has the seeded title.
      await db.homepageSection.updateMany({ where: { key: "announcements", title: "Community Announcements" }, data: { title: "Community Updates" } });
      await db.homepageSection.updateMany({ where: { key: "spotlights", title: "Latest Business Spotlights" }, data: { title: "Local Stories & Business Spotlights" } });
    }
    await db.setting.create({ data: { key: "homepageResidentOrder", value: { applied: untouched, at: new Date().toISOString() } } });
  }
  // One-time: add the free-account "join" section to existing installs, right after Garage Sales
  // (or at the end when that section is missing). Later sections shift down by one, so the admin's
  // own order is kept; the section can be switched off or moved in Admin → Homepage.
  if (!(await db.setting.findUnique({ where: { key: "homepageJoinSection" } }))) {
    let placed: string | null = null;
    if (!(await db.homepageSection.findUnique({ where: { key: "join" } }))) {
      const def = HOMEPAGE_SECTIONS.find((x) => x.key === "join")!;
      const anchor = await db.homepageSection.findUnique({ where: { key: "garage_sales" }, select: { sortOrder: true } });
      if (anchor) {
        await db.homepageSection.updateMany({ where: { sortOrder: { gt: anchor.sortOrder } }, data: { sortOrder: { increment: 1 } } });
        await db.homepageSection.create({ data: { ...def, sortOrder: anchor.sortOrder + 1 } });
        placed = "after garage_sales";
      } else {
        const max = (await db.homepageSection.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? -1;
        await db.homepageSection.create({ data: { ...def, sortOrder: max + 1 } });
        placed = "end";
      }
    }
    await db.setting.create({ data: { key: "homepageJoinSection", value: { placed, at: new Date().toISOString() } } });
  }
  await runBrandMigration(db);
  await runNamingMigration(db);
  await runEntityRepair(db);
  await runDoubleEncodedRepair(db);
  await runMembershipLimitsMigration(db);
  console.log("Seed complete.");
}

main().finally(() => db.$disconnect());

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
  { key: "hero", type: "hero", title: "Discover Tuscarawas County", subtitle: null, limit: 0 },
  { key: "explore", type: "explore", title: "Explore T-County", subtitle: null, limit: 8 },
  { key: "weekend", type: "weekend", title: "What's Happening This Weekend", subtitle: "Events and activities across the county", limit: 4 },
  { key: "spotlights", type: "spotlights", title: "Latest Business Spotlights", subtitle: "Stories of the people behind T-County businesses", limit: 3 },
  { key: "events", type: "events", title: "Upcoming Community Events", subtitle: null, limit: 6 },
  { key: "businesses", type: "businesses", title: "Featured Local Businesses", subtitle: null, limit: 8 },
  { key: "specials", type: "specials", title: "Local Specials", subtitle: "Deals from participating businesses", limit: 4 },
  { key: "things_to_do", type: "things_to_do", title: "Things to Do", subtitle: "Attractions, entertainment and family fun", limit: 4 },
  { key: "announcements", type: "announcements", title: "Community Announcements", subtitle: null, limit: 4 },
  { key: "cta", type: "cta", title: "Own a local business?", subtitle: "Get listed in the Tuscarawas County business directory — free.", limit: 0 },
];

const MENU = [
  ["Home", "/"], ["Businesses", "/businesses/"], ["Events", "/events/"], ["Specials", "/specials/"],
  ["Things to Do", "/things-to-do/"], ["Jobs", "/jobs/"], ["Articles", "/articles/"],
];
const FOOTER = [
  ["List Your Business", "/list-your-business/"], ["Memberships", "/memberships/"], ["Submit an Event", "/events/submit/"],
  ["Business Spotlights", "/spotlights/"], ["Search", "/search/"],
];

async function main() {
  for (const [i, [name, slug, icon]] of BUSINESS_CATEGORIES.entries()) {
    await db.businessCategory.upsert({ where: { slug }, create: { name, slug, icon, sortOrder: i }, update: {} });
  }
  for (const [i, [name, slug]] of EVENT_CATEGORIES.entries()) {
    await db.eventCategory.upsert({ where: { slug }, create: { name, slug, sortOrder: i }, update: {} });
  }
  for (const [i, s] of HOMEPAGE_SECTIONS.entries()) {
    await db.homepageSection.upsert({ where: { key: s.key }, create: { ...s, sortOrder: i }, update: {} });
  }
  if ((await db.menuItem.count()) === 0) {
    await db.menuItem.createMany({ data: MENU.map(([label, href], i) => ({ location: "HEADER" as const, label, href, sortOrder: i })) });
    await db.menuItem.createMany({ data: MENU.map(([label, href], i) => ({ location: "MOBILE" as const, label, href, sortOrder: i })) });
    await db.menuItem.createMany({ data: FOOTER.map(([label, href], i) => ({ location: "FOOTER" as const, label, href, sortOrder: i })) });
  }
  // Proposed plans — inactive until the owner approves pricing in Admin → Memberships.
  const plans = [
    { slug: "free", name: "Free Listing", priceCents: 0, interval: "FREE" as const, sortOrder: 0, isActive: true,
      description: "A standard profile in the T-County business directory.",
      features: ["Standard business profile", "Basic contact information", "Business category", "Associated editorial articles"],
      entitlements: { promotions: false, events: true, updates: false, analytics: false, maxPhotos: 6 } },
    { slug: "business-insider", name: "Business Insider", priceCents: 2900, interval: "MONTH" as const, sortOrder: 1, isActive: false,
      description: "Everything you need to stay in front of local customers.",
      features: ["Enhanced business profile", "Expanded photo gallery", "Business-managed promotions", "Event submissions", "Business updates", "Engagement analytics"],
      entitlements: { promotions: true, events: true, updates: true, analytics: true, maxPhotos: 40 } },
    { slug: "founding-business", name: "Founding Business", priceCents: 24900, interval: "YEAR" as const, sortOrder: 2, isActive: false,
      description: "Lock in founding-member pricing for a full year.",
      features: ["All Business Insider features", "Founding Business badge", "Annual billing — two months free"],
      entitlements: { promotions: true, events: true, updates: true, analytics: true, maxPhotos: 60 } },
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
  console.log("Seed complete.");
}

main().finally(() => db.$disconnect());

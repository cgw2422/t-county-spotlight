# TCountySpotlight rebuild: audit, plan and architecture

## 1. Audit of the current site (status: blocked, needs a re-run from Railway)
The development sandbox's network policy blocked `tcountyspotlight.com`, its CDN and the Wayback Machine, so a live crawl was not possible. The only things confirmed so far:
- WordPress site, title "Tuscarawas County Spotlight".
- A custom post type **`business`**, with URLs like `/business/b-e-co-photography/` (B. E. & Co. Photography, a Dover photography studio, found via web search).
- Business spotlight articles (posts).

**The full audit is automated.** The WordPress importer (Admin → WordPress Import) discovers every post type, taxonomy, page, media item, menu and custom field exposed by the site, and records it in the migration report. That report is the definitive inventory (total records per type, custom post types, unmapped fields, endpoints that required credentials). Run it from staging, where the network is open.

What may need extra access (the report will say exactly which):
| Content | Why it may be hidden | What to provide |
|---|---|---|
| Drafts, scheduled, pending and private posts | REST API only exposes published content publicly | WordPress **Application Password** (Users → Profile) → `WP_USERNAME`, `WP_APP_PASSWORD` |
| Custom fields (ACF) not exposed in REST | ACF "Show in REST" off | **Tools → Export → All content** (WXR XML) and upload it in the importer |
| Business application form submissions | Form plugins (WPForms, Gravity Forms…) store entries outside posts | CSV export from the form plugin |
| Menus | Needs authentication | Application Password, or recreate in Admin → Menus |
| Yoast SEO titles and descriptions | Read from `yoast_head_json` (public) or postmeta (WXR) | none, usually |

## 2. Design direction
"Modern community magazine × local app". Deep navy (from the existing logo) with a bright civic blue for actions and a warm sunset orange accent. Editorial serif headlines (Fraunces) and a clean sans body (Inter). Large photography, generous whitespace and rounded cards. On desktop: a multi-column magazine layout with a traditional top navigation. On phones: app-style bottom tabs (Home, Explore, Events, Specials, Profile), touch-sized controls and safe-area support. The existing logo is imported from WordPress automatically (and can be uploaded in Settings). A neutral Ohio-outline mark is shown until then.

## 3. Architecture
- **Next.js 16 App Router** (React 19, TypeScript). Server components render all public pages (SEO) and Server Actions handle mutations.
- **PostgreSQL + Prisma 7.** All business rules are enforced server-side (`src/lib/auth.ts` → `requireStaff`, `requireBusinessAccess`).
- **Auth:** database sessions (httpOnly cookie, SHA-256 hashed token), bcrypt passwords, email verification, password reset, optional TOTP 2FA for admins.
- **Storage:** an S3-compatible bucket, or PostgreSQL as a fallback. Never the container disk.
- **Payments:** Stripe Checkout and Billing Portal. Entitlements come only from webhook-verified subscription rows, and webhooks are idempotent through the `StripeEvent` table.
- **PWA:** web manifest, service worker (network-first pages, offline fallback, no caching of private areas), install guidance, and web push with per-category opt-in.
- **Railway:** web service, Postgres, optional bucket, cron call to `/api/cron/` and health check `/api/health/`.

## 4. Database (see `prisma/schema.prisma`)
- Users: `User`, `Session`, `VerificationToken`.
- Directory: `Business` (one profile), `BusinessCategory`, `BusinessPhoto`, `BusinessOwner` (many-to-many, so one account can manage several businesses), `BusinessApplication`, `BusinessUpdate`, `BusinessFollow`.
- Editorial: `Article` (separate from Business) ↔ `ArticleBusiness` ↔ `Business`, so a business can have many spotlights and editing a profile never touches articles. Also `ArticleRevision`, `Category`, `Tag`, `Page`.
- Community: `Event` (recurrence stored as a rule and expanded at read time), `EventCategory`, `Promotion`, `PromotionRedemption`, `Job`, `SavedItem`, `PushSubscription`, `EngagementEvent` (real recorded actions only).
- Site: `HomepageSection`, `MenuItem`, `Setting`, `Media`, `MediaBlob`, `Redirect`, `AuditLog`.
- Money: `MembershipPlan`, `Subscription`, `Payment`, `SponsorshipProduct`, `Placement`, `StripeEvent`.
- Migration: `MigrationRun`, `WpRecord` (one row per discovered WordPress record → its status and new location).

## 5–6. Migration and URL preservation
See `docs/MIGRATION.md`. In short:
- Articles keep their exact WordPress URL. The `legacyPath` column is served by a catch-all route, and `trailingSlash: true` matches WordPress.
- Businesses stay at `/business/<slug>/`.
- Original HTML is stored verbatim in `originalContent`, and image URLs are rewritten to permanent storage.
- Re-runs are idempotent (keyed on WordPress IDs), and the importer never overwrites articles edited in the new CMS.
- Any URL that has to change gets a 301 in the `Redirect` table.

## 7. Admin dashboard (`/admin`)
Overview · Articles (editor, scheduling, revisions, trash) · Businesses (+ categories, owners, complimentary memberships) · Applications · Events · Specials · Updates · Jobs · Homepage · Menus · Pages · Media · Users · Memberships and sponsorships · Redirects · WordPress Import · Settings · Audit log.

## 8. Homepage
These sections are fully configurable in Admin → Homepage (order, on/off, titles, limits, pinned records):
1. Hero with search
2. Explore T-County
3. This Weekend (auto-selected by date)
4. Latest Business Spotlights
5. Upcoming Events
6. Featured Businesses (sponsored placements labeled)
7. Local Specials (expired offers drop out automatically)
8. Things to Do
9. Community Announcements
10. "Own a business?" call to action

## 9. Implementation sequence
| Phase | Status |
|---|---|
| 1. Foundation and migration: schema, auth, roles, importer, URL preservation, admin | built, awaiting live import |
| 2. Public redesign: homepage, directory, profiles, articles, search, SEO | built |
| 3. Community: events, specials, submissions, owner dashboard, member accounts | built |
| 4. PWA: manifest, icons, service worker, offline, push foundation | built |
| 5. Monetization: plans, Stripe checkout and webhooks, entitlements, sponsorships | built; payments disabled until approved |
| 6. Launch: live import, verification, DNS | pending your review (`docs/LAUNCH_CHECKLIST.md`) |

# T County Connect: resident platform audit and phased plan

## Audit (November 2026)
| Area | Status |
|---|---|
| Business directory, profiles, Free/Premium memberships (per-listing entitlements) | Complete |
| Articles, business spotlights, community announcements (Article kind ANNOUNCEMENT) | Complete |
| Events: list/calendar, today/weekend/week/month, categories, recurrence (America/New_York), submissions with moderation, Free 3-event limit | Complete. **Phase 1:** tonight/tomorrow views, community and attribute filters, vendor info |
| Specials, jobs | Complete |
| T County Gives: nonprofits, churches, needs (deadlines), volunteer opportunities, claims, CSV import | Complete. Phase 3: broader need types, filtering |
| Community Pulse (admin, archive, hero card, analytics) | Complete |
| Newsletter (double opt-in, campaigns, Resend) | Complete, incl. Phase 4 personalized community block |
| Accounts, saved items (SavedItem: business/event/promotion/article), follows, push (opt-in, per category) | Complete. Phase 2: My T County, guest saves, more saved types |
| Admin dashboard, homepage sections (toggle/reorder/featured), hero appearance with draft/preview | Complete |
| PWA (manifest, icons, service worker, offline page, install prompt, bottom nav) | Complete. Phase 2: Saved and My T County in the bottom nav |
| Search (businesses, events, specials, articles, pages, organizations, Pulse) | Partial. Phase 3/4: type and community filters, food trucks, garage sales |
| Analytics (EngagementEvent, privacy-conscious, aggregate) | Partial. Phase 4: community feature dashboard |
| Food trucks | **Missing → Phase 1** |
| Garage and yard sales | **Missing → Phase 1** |
| Unified submissions queue | Partial: separate queues → **Phase 1 central queue** |
| Town pages, Explore collections, New and Coming Soon | Missing → Phase 3 |

### Needs your decision
- **Sponsored placements** (Admin → Sponsored placements, the "Sponsored" label on homepage businesses, weekend guide and specials) are paid placements. The ad-free direction says no paid placement on resident-facing community features. Nothing has been removed; decide whether to retire them.
- **Footer color.** The brief says "all-white logo in the green footer", but you later asked to change the footer back to navy. The navy footer is kept.

## Phase 1: make it useful every day (this release)
1. Events: Today / Tonight / Tomorrow / This Weekend / This Month, plus filters for community (town), free, family, live music, festivals, food, markets, church, fundraisers, indoor and outdoor. Vendor info for markets. Past events are never shown as upcoming.
2. **Food Truck Tracker** at `/food-trucks/`. A truck is a business listing flagged as a food truck, managed through the existing owner dashboard and Listing Access. Owners or admins enter scheduled stops (one-off or weekly). "Scheduled" and "Confirmed by the truck today" are shown separately, with a last-updated date. Not Premium-gated.
3. **Garage Sale Tracker** at `/garage-sales/`. Simple resident submission with no account needed. Address privacy (exact or general location). Email stays private and gets a secure manage link. Spam protection and moderation. Sales expire automatically after the last day.
4. Resident-first homepage: quick access to everyday features; Today, Weekend, Food Trucks and Garage Sales sections; existing sections kept and reorderable.
5. **Admin "Community submissions" queue** covering everything awaiting review (events, garage sales, applications, organizations, claims, specials, updates, jobs), plus a **content freshness** overview. Public `/submit/` hub that links to the forms.

## Phase 2: personalization
My T County (community choice, guest preferences in localStorage that merge into an account), Saved page (more types, guest saves, "ended" badges), community-first homepage ordering, and a bottom nav of Home, Explore, Events, Saved and My T County.

## Phase 3: stronger community content
Explore T County collections (admin-curated), town pages, New and Coming Soon, community updates, T County Gives need types and expiry, and Community Pulse integration.

## Phase 4: retention
Personalized newsletter, saved-event reminders and weekend summaries (opt-in, email first), and community feature analytics.

Done (email):
- **Newsletter "Around your community" block** — subscribers pick communities on the preferences page / signup ("Your community"); linked members fall back to their My T County communities. Built at send time (`src/lib/newsletter/community-block.ts`, cached per distinct community set), up to 4 published, non-sponsored items this week, filtered by topic preferences, omitted when empty. Countywide recipients get the unchanged email. Per-campaign toggle (`content.communityBlock`, default on) and per-community preview in admin.
- **Member email updates** (`src/lib/notifications/`): weekend summary, saved event reminders, new in my communities. Opt-in only, verified active members, never suppressed addresses. `NotificationDelivery` row created before sending is the idempotency lock. One-click signed "turn off" link (`/account/notifications/unsubscribe/?t=`, plus RFC 8058 `/api/notifications/unsubscribe/`). Run by `/api/cron/` — schedule it at least hourly (see `docs/DEPLOYMENT.md`). Tests: `npx tsx --conditions=react-server scripts/test-notifications.ts`.
- Push stays optional and separate.

Maps are deferred: they need a tile and geocoding provider, which means a third-party service and possibly a recurring cost. Directions links are used instead.

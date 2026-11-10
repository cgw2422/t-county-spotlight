# Resident experience review (brief §24) and usage measurement (§25)

November 2026. Tested with Playwright (Chromium) at **390 × 844** (phone, touch, iPhone UA) against the local dev server, from the homepage, with a small set of TEST records (one event today, one food truck stop, one Saturday garage sale, two businesses, one collection) that were deleted afterwards. "Tap" means one tap or click.

## Can a resident answer these from the homepage?

| Question | Tap path from the homepage | Taps | Result |
|---|---|---|---|
| What's happening in Tuscarawas County today? | Hero chip **Today** → `/events/?when=today` (also the Explore grid "Today" and the "What's Happening Today" section, visible on first scroll) | 1 | Pass |
| What can my family do this weekend? | Hero chip **This weekend** → **Family-friendly** chip on the events list → `/events/?when=weekend&attr=family` | 2 | **Fixed.** Before, the family filter lived only in the collapsed filter panel (open panel, tick box, Apply: 4 taps). The events list now has one-tap **Family-friendly** and **Free** toggles next to the date chips |
| Where are food trucks serving lunch? | Hero chip **Food trucks** → `/food-trucks/` (defaults to today, with confirmed/scheduled stops and directions) | 1 | Pass |
| Are there garage sales this Saturday? | Hero chip **Garage sales** → **This weekend** tab → `/garage-sales/?when=weekend` | 2 | Pass. The homepage "Garage Sales" section also lists upcoming sales directly |
| What new businesses are opening? | Hero chip **New businesses** → `/new/` | 1 | **Fixed.** Before, the only homepage link to New & Coming Soon was the last section (about 7,000 px down) and the footer |
| Are there any local specials? | Explore grid **Local Specials** → `/specials/` (first screen) | 1 | Pass |
| What's happening in my town? | Community prompt below the hero: pick a town (1 select). The homepage reorders local-first; the switcher now shows a **"Dover page →"** link to `/communities/dover/` | 1–2 | **Fixed.** Before, after choosing a town there was no link from the homepage to that town's page. Bottom nav **My T County** also works (1 tap) |
| Where can I volunteer? | Hero chip **Volunteer** → `/gives/volunteer/` | 1 | Pass |
| What businesses do residents recommend? | Explore grid **Community Pulse** → `/community-pulse/` (resident recommendation round-ups) | 1 | Pass. When an entry is featured, it is the hero card, which is 1 tap away |
| Can I save something to revisit? | Save button on homepage food truck and garage sale cards (1 tap) → bottom nav **Saved** to see it. Events: open the event, then **Save** | 1–2 | Pass (checked: a saved food truck appears on `/saved/` for a guest) |

## Other friction fixed

- **Tap targets under 44 px.** The hero quick-link chips were 32 px tall and are now 44 px. Section "View all" / "See all food trucks" / "All garage sales" links were 20 px tall and are now 44 px, with no visible layout change. The events date chips went from 40 to 44 px.
- **Horizontal overflow.** The new "on" label on the events toggle chips escaped its scroll container and widened the page to 810 px. I caught it during testing and fixed it before release. Every page checked is now exactly 390 px wide: home, events (today, weekend, filtered), food trucks, garage sales, new, specials, My T County, Gives, volunteer, Pulse, saved, community page, explore, search, submit, a business, an event, offline, and the admin analytics dashboard.
- **Oversized brand images.** On every page, the header logo was the 960 px PNG (258 KB) shown 132 px wide. The footer logo was 960 px (81 KB), loaded eagerly below the fold. The county mark was the 512 px PNG (199 KB) shown at about 31 px. Now the header uses `logo-sm` (480 px, 73 KB). The footer uses `logo-white-sm` (27 KB, `loading="lazy"`). The mark goes through `next/image` (64 px at 1x/2x, about 4 KB).

## Performance

Local dev server (Turbopack, unminified), so the absolute numbers are higher than production. Each figure is the median of 5 runs.

| Measurement | Before | After |
|---|---|---|
| Homepage TTFB (curl), no community | 516 ms | 509 ms |
| Homepage TTFB (curl), community = Dover | 523 ms | 435 ms |
| Brand images on first homepage load | ≈ 525 KB (logo 252 KB + mark 194 KB + footer logo 79 KB, all eager) | **71 KB** (all images on the page) |
| Below-the-fold images loaded eagerly (homepage) | 5 | 0 |
| Browser timing after (Playwright, 390 px, 3x DPR) | n/a | TTFB 482 ms, FCP 660 ms, load 1.1 s (no community); TTFB 486 ms, FCP 820 ms (Dover) |

- **Homepage queries.** Sections already render in parallel: each section is an async server component started together, and the first batch is a `Promise.all`. Three small sequential chains were made parallel without changing output: hero (featured Pulse, then hero appearance), weekend (occurrences, then sponsor placement), and brand asset URLs (after the first batch). The TTFB difference is within dev-server noise. No N+1 queries were found on the homepage sections.
- **Images.** Content images already use `next/image`/`SmartImage` with `sizes`. No content image was missing `sizes`. The only images without `sizes` are fixed-size brand marks, which correctly get a 1x/2x `srcset`.
- **Service worker.** `public/sw.js` precaches `/offline/` (fetched without cookies) and never caches `/api`, `/admin`, `/account`, `/dashboard` or the auth pages. Pass.
- **Lighthouse.** Not installed in the environment and not added. Measurements use Playwright navigation timing instead.

## Remaining issues / not changed

- Footer link lists are 19 px tall text links with spacing between them. That meets the 24 px spacing rule but is under 44 px. They were left as they are because 44 px rows would roughly double the footer height. Revisit if residents mis-tap.
- The events list/calendar toggle is 36 px inside a 44 px group.
- The New & Coming Soon homepage section is still the last section by default. Admins can move it in Admin → Homepage.
- In production, only real-device testing (iOS Safari, Android Chrome) can confirm the install prompt and the standalone-launch signals.

## Usage measurement (brief §25)

Admin → **Community analytics** (`/admin/analytics/`, staff only) shows aggregate counts for the last 7, 30 or 90 days, with CSV export. The main dashboard's engagement card links to it.

What is recorded, all through `/api/track` and stored as `EngagementEvent`: feature page views (events list by quick date, community pages, collections, Gives, Share something, garage sales list), plus the existing views, clicks, saves and searches. It also records `visit` and the PWA signals:

- `visit` (new or returning) is sent once per day per device. The device keeps a `tct_seen` date in `localStorage`. That date is **not an identifier** and is never sent; only the word "new" or "returning" goes to the server.
- `pwa_launch` is sent once a day when the site is opened as an installed app.
- `pwa_installed` is sent when the browser fires `appinstalled`. Chromium only; iOS never reports installs.
- `install_prompt_shown` and `install_prompt_accepted` come from the install prompt.

Privacy:

- No IP address, user agent, name or email is stored.
- `visitorHash` = sha256(ip + UA + day), so nobody can be followed across days, and "unique visitors" are per-day estimates only.
- With Global Privacy Control or Do Not Track turned on, the browser sends nothing and writes no flag. The server also drops requests carrying `Sec-GPC: 1` or `DNT: 1`, including the aggregate save count.
- Bots are filtered, and rate limiting still applies.
- Server-side validation accepts only known event types and small fixed target vocabularies.

# WordPress migration

The importer copies the WordPress site at `WP_BASE_URL` (https://tcountyspotlight.com) into the new database: posts, business listings, pages, custom post types, categories, tags, custom taxonomies, ACF and other custom fields, Yoast SEO, featured and inline images, the site logo and icon. It also creates redirects and writes a report of everything it found.

It never rewrites, summarizes or invents content. Titles and HTML are copied as they are. Only URLs change: image URLs point at the new storage, and absolute links to the old site become relative paths. The untouched WordPress HTML is kept too: in `Article.originalContent` and `Page.originalContent`, and in `Business.wpMeta.originalContent` for businesses.

Code: `src/lib/wordpress/` (REST client, WXR parser, importer, media, mapping, report). Admin UI: `/admin/migration/`. CLI: `scripts/migrate-wordpress.ts`.

## Running it

### Admin UI (recommended on Railway)
1. Sign in as an **admin** and open **Admin → WordPress Import** (`/admin/migration/`).
2. Start with a **Dry run**. It discovers everything and shows a plan, but writes no content. Only the run and its report are saved.
3. Run the real import. It runs in the background on the server, and the run page refreshes every 3 seconds with the live log.
4. Read the report on the run page, or download it as `.md` or `.json`.

You can run it from the live site over REST, or upload a WXR export file (up to 200 MB). Each run start is recorded in the audit log. Only one run can be active at a time. A run that still shows as "running" after 6 hours (for example after a redeploy) is marked failed, and you can simply run the import again.

### CLI
```bash
npx tsx --conditions=react-server scripts/migrate-wordpress.ts                  # REST from WP_BASE_URL
npx tsx --conditions=react-server scripts/migrate-wordpress.ts --dry-run
npx tsx --conditions=react-server scripts/migrate-wordpress.ts --file=export.xml  # WXR
  --base=https://…   --force   --skip-media   --all-media   --limit=N
```
Suggested `package.json` script: `"migrate:wp": "tsx --conditions=react-server scripts/migrate-wordpress.ts"`. The script adds `--conditions=react-server` itself if you leave it out. That flag is needed because the shared `server-only` modules, such as storage, only load under it. Reports are written to `migration-reports/<timestamp>.md` and `.json`, and the run also shows up in the admin UI.

The production image is a Next `standalone` build and does not include `tsx`. To run the CLI against production, run it from a checkout with the production `DATABASE_URL` and `S3_*` variables (for example `railway run npm run migrate:wp`), or use the admin UI.

## Credentials and sources

| Source | What you get |
|---|---|
| REST, no credentials | Published posts, pages and public custom post types. Public media, terms and users. Yoast `yoast_head_json`. ACF fields if "Show in REST API" is on (or the ACF-to-REST plugin, `acf/v3`). |
| REST + Application Password | All of the above, plus **drafts, scheduled (future), pending and private** posts (`status=any`, `context=edit`), raw titles, manual excerpts and menus (`/wp/v2/menus`). |
| WXR export | Everything in the database for each post type: every status, all postmeta (ACF, Yoast `_yoast_wpseo_*`, directory plugins), custom post types hidden from REST, menus and comment counts. |

- **Application Password:** in WordPress, go to *Users → Profile → Application Passwords*, add one named "Migration", and copy it. Set `WP_USERNAME` (the login name) and `WP_APP_PASSWORD` on the server (or in `.env` for the CLI). The admin page shows whether they are set. If WordPress rejects them, the import goes on with public data only and the report says so.
- **WXR export:** *Tools → Export → All content*. Media files are still downloaded from the live site, so it must still be online.
- **Post types hidden from REST:** the importer reads the sitemap (`/wp-sitemap.xml` or Yoast `sitemap_index.xml`). If a post type such as `business` has public URLs but no REST endpoint, the importer reads each public page as a best-effort fallback: the `.entry-content` HTML, the title, `og:image` and the meta description. It then warns you to use a WXR export to get the complete fields.
- **Form submissions** (WPForms, Gravity Forms, Ninja Forms, Contact Form 7/Flamingo, Formidable) are **not** in REST, and in WXR they appear only for some plugins. The importer never publishes them. Post types like `flamingo_inbound` and `nf_sub` are listed as *skipped*. Export them with the form plugin's own **CSV export** and review them by hand. Old business applications should go into Admin → Applications.
- Every endpoint that answered 401 or 403 is listed in the report under **Endpoints that required credentials**.

## What maps where

| WordPress | New app |
|---|---|
| `post` | `Article`. `kind` comes from category, tag and title words: *spotlight* → SPOTLIGHT, *announcement/press/notice* → ANNOUNCEMENT, *things to do/events/weekend/festival* → THINGS_TO_DO, *news* → NEWS, otherwise GENERAL. |
| status | publish → PUBLISHED, future → SCHEDULED, draft/auto-draft → DRAFT, pending → PENDING, private → UNPUBLISHED (businesses: publish → PUBLISHED, pending → PENDING, else DRAFT) |
| `business` (and any CPT named like business/listing/directory/company/place) | `Business`. Title → name, content → description (HTML), featured image → cover. ACF and meta are matched by name: address/street/city/state/zip, ACF Google Map (address, lat, lng), phone, email, website/url, facebook/instagram/twitter/x/tiktok/youtube/linkedin/pinterest, hours (an ACF repeater becomes structured `hours`; free text goes to `wpMeta.mapped.hoursText`), logo, gallery → `BusinessPhoto`, tagline. **All raw meta is kept in `wpMeta.meta`.** |
| taxonomies on the business type | `BusinessCategory`. A seeded category with the same slug is adopted. A slug clash with another taxonomy gets a `-<taxonomy>` suffix. |
| `category` / `post_tag` | `Category` / `Tag` (matched on `wpId`, then slug) |
| `page` | `Page` (nested paths kept, `originalContent` stored) |
| any other CPT | `Article` with kind GENERAL and `wpType` = the CPT name, so nothing is lost. It is listed under **Unmapped custom post types**. |
| other taxonomies | Term names are stored in each record's `wpMeta.terms` and listed under **Unmapped taxonomies** |
| Yoast / Rank Math | `seoTitle`, `seoDescription`, `ogImageUrl` (`%%title%%`, `%%sep%%`, `%%sitename%%` resolved for WXR) |
| site logo / icon | `Setting.logoUrl` / `faviconUrl` **only if empty**. Name, tagline and URL go to `Setting.wpSiteInfo`. If REST has no `site_logo`, the homepage `custom-logo` `<img>` and `<link rel=icon>` are used. |
| menus | Saved to `Setting.wpMenus` for reference only. The site menus are **not** replaced; edit them in Admin → Menus. |

**Article ↔ business links** (`ArticleBusiness`) are made when an article links to the business URL (`/business/<slug>/` or its old path), when an ACF relationship or post-object field (key containing business, listing, related…) holds the business ID, or when the business name (5 or more characters) appears in the article title. Linking never changes article text. A business with a **published SPOTLIGHT** article gets `isSpotlighted = true`. The importer never sets it back to false.

**Media.** The importer downloads featured images, inline `<img>`, `srcset`, galleries (`[gallery]` in WXR), ACF image fields, the OG image, the logo and the icon. Downloads run at most 4 at a time and retry on failure. Sized variants (`-300x200.jpg`), `-scaled` originals and Jetpack Photon URLs (`i0.wp.com/...`) all map to one stored file. Files are stored through `saveImageUpload()` (S3 bucket or PostgreSQL) with alt text, caption, title, `wpId` and `sourceUrl`. A `Media` row with the same `sourceUrl` is reused, so re-runs never download again. PDFs linked from content are stored too. Any file that fails to download keeps its old URL and is listed under **Missing files**. `--all-media` also copies library files that nothing references.

**Raw WXR content** goes through WordPress's own display filters: `wpautop`, and `[caption]` → `<figure>`. Any other shortcodes are left as text and listed in the report.

## Idempotency and local edits
- Records are matched on `(wpType, wpId)` for Article and Business, `wpId` for Page, Category, Tag and BusinessCategory, `legacyPath`, and `sourceUrl` for Media. Running the import twice creates no duplicates. This was verified on the fixture: the second run created 0 rows and downloaded 0 files.
- Every discovered record gets a `WpRecord` row (`imported | failed | skipped | preserved_local_edits`) with its old URL and new location. Each run is a `MigrationRun` with its log and JSON report.
- **Articles and pages** with `localEditedAt` set (any edit in the new CMS) are left unchanged and marked `preserved_local_edits`.
- **Businesses** store a hash of the fields the importer wrote, in `wpMeta.__import.hash`. If any field differs on the next run, someone edited the business locally. In that case only fields that are empty locally are filled in, and the record is marked `preserved_local_edits`.
- **Force** (`--force`, or the *Overwrite local edits* checkbox) re-imports these records anyway. Articles keep their revisions, and `localEditedAt` is cleared.
- One failing record never stops the run. It is listed under **Failed imports** with the error.

## URLs and redirects
- Articles keep their exact WordPress path in `legacyPath` (for example `/2024/05/some-post/`), and a catch-all route serves them there, so most posts need no redirect. Pages keep their path, including nested paths. Businesses live at `/business/<slug>/`, the same as on WordPress.
- A 301 redirect (`source = "migration"`) is created only when a path changes, and also for these WordPress-specific URLs:
  - `/?p=<id>` and `/?page_id=<id>` → the canonical URL. These rows store the query string in `fromPath`, so the redirect resolver must look up `pathname + search` for them.
  - `/category/<slug>/` → `/articles/?category=<slug>`, `/tag/<slug>/` → `/articles/?tag=<slug>`
  - business taxonomy archives (for example `/business-category/<slug>/`) → `/businesses/?category=<slug>`
  - `/author/<slug>/`, `/feed/` and `/comments/feed/` → `/articles/`. The CPT archive (for example `/business/`) → `/businesses/`.
- The importer never creates a redirect for a path that is live imported content, and never overwrites a **manual** redirect.

## Report contents
Records discovered per type, with the source's own totals. Articles by kind and status. Businesses, pages, categories, tags and business categories. Article ↔ business links. Images referenced, downloaded, reused and failed. Failed imports with reasons. Missing files. Broken internal links: links that match no imported path, redirect or app route. Duplicates detected: repeated IDs, slug or path clashes. URL changes. Redirects. Endpoints that required credentials. Unmapped post types, taxonomies and fields. Unexpanded shortcodes. Menus. Branding. Warnings. A dry run adds the per-record plan.

## Verification checklist (after the live import)
1. **Discovered vs source totals** match for every post type. If they don't, check *Endpoints that required credentials*, then add an Application Password or import a WXR export.
2. **Failed imports = 0** (or each one is understood), and **missing files** have been reviewed.
3. Spot-check 5 articles: title, body, images, publish date, author, categories, SEO title and description, and that the old URL loads at the same path.
4. Spot-check 5 businesses: address, phone, website, socials, logo, cover, gallery, categories, and the linked spotlight articles. Check the `wpMeta.mapped.hoursText` and *Unmapped fields* tables for data you want shown.
5. Drafts and scheduled posts appear in Admin → Articles with the right status.
6. Open a few `/?p=ID`, `/category/...` and `/tag/...` URLs and confirm the 301s.
7. Work through **Broken internal links** and **unexpanded shortcodes**.
8. The logo and favicon look right (Admin → Settings). The importer does not replace one that was already set.
9. Run the import a **second time**. It should report *0 created* and *0 downloaded*.

## Testing with fixtures (never against real data)
`scripts/fixtures/` holds a fake WordPress server (`fake-wp-server.ts`, port 8787) and a WXR file (`fixture-export.xml`). Every record in them is marked "Fixture …". The fake server covers pagination, drafts behind auth, ACF, Yoast, a custom taxonomy, a CPT hidden from REST, real PNG and JPEG bytes, sized variants, a missing file, a PDF and the homepage logo.
```bash
npx tsx scripts/fixtures/run-fixture-tests.ts          # 70+ checks, then removes all fixture rows
npx tsx scripts/fixtures/run-fixture-tests.ts --keep   # leave the rows to inspect
npx tsx --conditions=react-server scripts/fixtures/cleanup-fixture-data.ts
```
The test refuses to run unless `DATABASE_URL` points at localhost. Cleanup deletes only rows that are clearly fixture data: rows with `wpMeta.base` or `sourceUrl` on `http://localhost:8787`, fixture-named terms, and the runs, redirects and settings those runs created.

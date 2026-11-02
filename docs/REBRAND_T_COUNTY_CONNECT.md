# Rebrand: TCountySpotlight → T County Connect

Official name **T County Connect**. Headline: **Discover more of T County.**
Tagline: *Explore local businesses, upcoming events, community news, specials, jobs, churches and nonprofits across Tuscarawas County.*

This was a branding update to the existing platform. No records were deleted or recreated, and no URL or slug changed.

## Brand system
| Token | Value | Use |
|---|---|---|
| County Navy | `#0B2340` | Branding, headings, navigation, primary buttons, prominent backgrounds (`navy-*`, `brand-*`) |
| Hillside Green | `#387D14` | Community accents, positive actions, eyebrows, highlights (`hillside-*`, `btn-green`, `badge-green`) |
| Sunrise Orange | `#FF8508` | Sparing emphasis and key calls to action (`sunset-*`, `btn-accent`, with navy text for contrast) |
| Off White | `#F7F8F5` | Soft backgrounds (`cream`, `offwhite`) |

- **Tokens:** defined once in `src/app/globals.css` (`@theme`) and `src/lib/brand.ts`. Existing token names were kept so every component recolored automatically.
- **Contrast:** white text on navy is about 16:1, and on green about 5.1:1. Navy text on orange is about 6.4:1. Orange text on white uses `sunset-600` (#B35A00, about 4.8:1).
- **Fonts:** Montserrat 700/800 for headings, navigation, buttons and labels, and Open Sans 400/600/700 for body text. Both are self-hosted through `@fontsource`.

## Logo pipeline (no redrawing)
The official artwork is committed **unchanged** at `public/brand-source/t-county-connect-logo.png` (2170×725 PNG, sha256 `88ef86da…020d`) and is used by default. An admin upload in Settings only replaces it.

Upload the original artwork in **Admin → Settings → General → Official logo (original artwork)** (`brandLogoUrl`). The route `/brand/<asset>` generates the following from it, using cropping, trimming and resizing only:
- `logo.png`, `logo-sm.png`: the trimmed horizontal logo for the header, footer (on a white plate over navy), emails and structured data
- `mark.png`: the county-outline mark, cropped from the left of the logo. The orange divider and the wordmark are left out.
- `icon-32/48/192/512.png`, `maskable-512.png` (20% Android safe zone) and `apple-touch-icon.png`: the mark centered on white
- `og.png`: the 1200×630 social sharing image (the logo on white with navy and green bands)

An optional **Icon mark** upload (`brandIconUrl`) takes priority over the automatic crop. URLs are versioned (`?v=`), so browsers and the PWA pick up changes at once. Until the official artwork is uploaded:
- the header shows the name "T County Connect" in Montserrat
- icons fall back to neutral navy placeholders (`public/icons/`)

## Stored-data update (runs once on deploy: `src/lib/brand-migration.ts`)
- **Settings and page content:** only values still **exactly equal** to the old defaults are changed, so customized values are kept. This covers:
  - site settings: site name, PWA name and short name, email From name, tagline, SEO title and description, theme color, background color, footer text
  - the seeded homepage hero headline
  - the "T-County Weekly newsletter" menu label
- **Old logo and favicon:** the old-brand logo and favicon copied from WordPress (Media rows with a `sourceUrl`) are cleared from settings. Their previous values are saved under setting `preRebrandBranding`.
- **Newsletter settings:**
  - The sender name "T-County Weekly" becomes "T County Connect Weekly".
  - `consentVersion` changes from 2026-10-v1 to 2026-11-tcc-v1 for **new** signups only.
- Guarded by the `brandMigration` setting, so it runs once.

**Never touched:** articles (including historical "TCountySpotlight" mentions in editorial text), businesses, organizations, events, users and sessions. Newsletter subscribers are also untouched: status, confirmation, consent text and version, unsubscribes, suppressions and preferences. The same goes for media, redirects and URLs.

## Audit of old-brand references
| Location | Decision |
|---|---|
| UI text, page titles, emails (admin, owner, organization, claims, applications, newsletter) | Changed to T County Connect / T County Connect Weekly |
| Header, footer, auth pages, admin and dashboard sidebars, install prompt, email headers | Official logo or mark |
| Settings defaults (`src/lib/settings.ts`), newsletter copy (`src/lib/newsletter/copy.ts`) | Changed |
| Service worker | Cache version bumped to `v2-tcc` (purges cached old branding); notification title and icon updated |
| Manifest | T County Connect / T County / #0B2340 / #F7F8F5; icons from the brand pipeline |
| JSON-LD | Organization and WebSite (homepage) and article publisher use T County Connect plus the official logo. `alternateName: TCountySpotlight` keeps continuity for search engines. |
| TOTP issuer, Stripe `appInfo`, .ics PRODID | Changed (cosmetic). Existing authenticator codes keep working. |
| .ics event `UID` (`@tcountyspotlight`) | **Kept**, so calendar entries people already added aren't duplicated |
| `no-reply@tcountyspotlight.com` fallback sender, VAPID mailto, `tcountyspotlight.com` URLs | **Kept**: the domain and email authentication are unchanged |
| WordPress importer user agent and examples | **Kept**: the tool talks to the old WordPress site |
| `package.json` name, repository, Railway service, env vars, DB identifiers | **Kept** (internal identifiers) |
| Imported article content and `originalContent` | **Kept** verbatim (historical editorial content) |

## Manual configuration
1. ~~Upload the official logo~~ — done: the original artwork is built in. Admin → Settings → General shows previews of every generated asset; an optional separate icon mark can still be uploaded there.
2. **Admin → Settings:** review the site name, tagline, SEO and footer if they were customized before (customized values are not changed automatically).
3. **Admin → Newsletter → Settings:** confirm the From name ("T County Connect Weekly"). Don't change the From *address* until the new domain is verified with your provider (SPF/DKIM/DMARC).
4. **Stripe:** product names and descriptions live in your Stripe dashboard. Rename them there to "T County Connect …" (renaming doesn't affect existing subscriptions). Don't create new prices; the existing Price IDs keep working.
5. **Resend / SMTP:** sender display names update automatically. Change sending domains only after DNS verification.
6. **Search Console:** after deploy, request reindexing of the homepage. The URLs are unchanged.
7. **Hero photo:** add properly licensed Tuscarawas County photography in Admin → Homepage → Hero image.

## If the domain changes later (plan only, nothing done yet)
1. Choose and register the domain. Add it to Railway as a second custom domain alongside tcountyspotlight.com.
2. Verify email sending for the new domain (SPF, DKIM, DMARC) in Resend before switching the From address.
3. Set `APP_URL` to the new domain and redeploy. Canonical URLs, sitemap, OG and email links follow it.
4. Add a host-level 301 redirect from `tcountyspotlight.com/*` to `newdomain/*` with the same path, keeping the trailing slash. In Next.js, a `redirects()` entry with a `has: [{ type: "host", value: "tcountyspotlight.com" }]` rule works, or redirect at DNS or CDN level.
5. Add the new domain as a property in Search Console and use **Change of Address**.
6. Update the Stripe webhook URL and the Resend webhook URL. Leave the old ones in place until traffic moves over.
7. Keep tcountyspotlight.com registered and redirecting for at least 12 months.

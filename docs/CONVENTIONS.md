# TCountySpotlight — code conventions

**Stack:** Next.js 16 (App Router, Turbopack, `trailingSlash: true`), React 19, TypeScript, Tailwind CSS v4, Prisma 7 (`@prisma/adapter-pg`), PostgreSQL.

Read `node_modules/next/dist/docs/` before using an unfamiliar Next API. Next 16 differs from older versions: `params`/`searchParams`/`cookies()`/`headers()` are Promises, `middleware.ts` is now `proxy.ts`, and `cacheComponents` is OFF (pages that read the DB use `export const dynamic = "force-dynamic"`).

## Layout
| Path | Purpose |
|---|---|
| `prisma/schema.prisma` | Database schema (single source of truth) |
| `src/generated/prisma` | Generated client — import types from `@/generated/prisma/client` |
| `src/lib/db.ts` | `db` Prisma client |
| `src/lib/auth.ts` | sessions, `getCurrentUser`, `requireUser`, `requireStaff`, `requireAdmin`, `requireBusinessAccess`, `isStaff`, password helpers |
| `src/lib/settings.ts` | `getSettings()` / `saveSettings()` site settings (key/value table) |
| `src/lib/storage.ts` | `saveImageUpload()` → S3 bucket or PostgreSQL fallback (never local disk) |
| `src/lib/sanitize.ts` | `sanitizeRichText()` for any user/WordPress HTML rendered with `dangerouslySetInnerHTML`; `sanitizePlain()` |
| `src/lib/audit.ts` | `audit(userId, action, entityType, entityId, details)` |
| `src/lib/rate-limit.ts` | `rateLimit(key, limit, windowMs)` |
| `src/lib/email.ts` | `sendEmail()` (logs when SMTP unset) |
| `src/lib/events.ts` | recurrence expansion, weekend window, calendar links |
| `src/lib/promotions.ts` | effective promotion status + `activePromotionWhere()` |
| `src/lib/entitlements.ts` | paid features from verified subscription records |
| `src/lib/queries.ts` | shared public queries + card `select`s |
| `src/lib/links.ts` | canonical URLs (`articleHref`, `businessHref`, ...). Article canonical = WordPress `legacyPath` when present |
| `src/lib/utils.ts` | `cn`, `slugify`, date formatting (America/New_York), `fromDateInput`/`toDateInput`, `TUSCARAWAS_CITIES` |
| `src/lib/prose.ts` | `PROSE_CLASSES` for article bodies |
| `src/components/ui/*` | `SmartImage`, `ImageUpload` (hidden input + /api/upload), `SubmitButton`, `FormMessage`/`ActionState`, `EmptyState`, `ImagePlaceholder` |
| `src/components/cards/*` | Business / Event / Article / Special cards |
| `src/components/site/*` | public header, footer, bottom nav, logo, install prompt |

## Styling
Tailwind v4 with custom utilities in `src/app/globals.css`: `container-page`, `font-display`, `btn-primary|secondary|ghost|danger|accent`, `btn-sm`, `card`, `card-hover`, `label`, `input`, `help`, `badge-gray|blue|green|amber|red|orange|sponsored`, `section-title`, `eyebrow`, `table-base`. Colors: `navy-*`, `brand-*`, `sunset-*`. Headlines use `font-display` (Fraunces), body Inter.
Touch targets ≥ 44px (`min-h-11`). Every page must work at 360px wide and on desktop.

## Rules
- Server-side authorization on every query/mutation (`requireStaff`, `requireBusinessAccess`). Never trust IDs from the client without checking ownership.
- Mutations via Server Actions (`"use server"`), validated with `zod`. Use `useActionState` + `FormMessage` for feedback.
- Sanitize HTML before rendering. Never render untrusted HTML unsanitized.
- Never fabricate content, stats or engagement numbers. Show empty states instead.
- Sponsored items are always labeled (`badge-sponsored`, `settings.sponsoredLabel`). Payment never implies editorial spotlight (`isSpotlighted` is editorial only).
- Soft-delete editorial records (`deletedAt`), and write `audit()` entries for publish/approve/permission/membership/settings changes.
- Imported WordPress HTML is preserved verbatim in `Article.originalContent`; edits create an `ArticleRevision` and set `localEditedAt`.

## Cover photos (businesses, nonprofits, churches)
- Standard: 1920 × 600 px (3.2:1); uploads up to 25 MB. The original is stored untouched; `next/image` serves resized WebP variants.
- Render profile banners with `<ProfileCover>` (`src/components/ui/profile-cover.tsx`): `object-fit: cover`, focal point from `coverFocusX`/`coverFocusY` (0–100, default 50/50), fixed heights on phones/tablets and 3.2:1 (max 520 px) on large screens.
- Edit with `BusinessCoverField` / `AdminCoverField` / `OrgCoverField` (`src/components/ui/cover-photo-field.tsx`), which include the size note and focal-point picker; save with `focusFromForm(fd)` from `src/lib/cover.ts`.
- Logos stay separate (`logoUrl`, square, `object-contain`).

# Launch checklist

Do not point tcountyspotlight.com at Railway until every **critical** item passes.

## Content (critical)
- [ ] The WordPress import completed. The report shows 0 unexplained failures; each exception is listed and accepted.
- [ ] Article count matches WordPress (Posts → All, including drafts and scheduled).
- [ ] Business count matches the WordPress "business" post type.
- [ ] 10 random articles compared side by side: text, headings, images, galleries, embeds, dates, author.
- [ ] Featured images and inline images load from the new storage (not from tcountyspotlight.com/wp-content).
- [ ] Old URLs open the same content: open 10 articles, 10 businesses and all pages by their old URL.
- [ ] `/?p=<id>`, `/category/<x>/` and `/tag/<x>/` redirect correctly.
- [ ] SEO titles and meta descriptions carried over (view source on 5 articles).
- [ ] Spotlight articles are linked to the correct business profiles.
- [ ] The logo was imported (Admin → Settings) and the favicon is correct.

## Functionality
- [ ] Admin login, plus 2FA if enabled.
- [ ] Create, edit, schedule, publish and unpublish an article. Revision history works.
- [ ] Business owner: invite → reset password → edit profile → upload a photo → submit an event.
- [ ] Event submission → admin approval → appears on /events/ and in the homepage weekend section.
- [ ] Special: create → approve → visible; after its end date it disappears automatically.
- [ ] Member: register → verify → save business/event → account shows saved items.
- [ ] Password reset email arrives (SMTP configured).
- [ ] Homepage sections can be reordered and toggled, and menus edited.
- [ ] Image upload works and survives a redeploy (bucket or DB storage).

## Payments (only when activating)
- [ ] Plans approved, Stripe Price IDs set, test-mode checkout → webhook → membership active.
- [ ] Cancel and payment-failure flows update status.
- [ ] Switch to live keys and do one real low-value test.

## Responsive and PWA
- [ ] iPhone Safari, Android Chrome, iPad and desktop Chrome/Safari/Firefox: no overflow, nav works, forms usable.
- [ ] Install to home screen on Android and iOS; icon and standalone mode correct.
- [ ] Airplane mode shows the offline page; admin and account pages are not cached.

## Security and ops
- [ ] Strong `ADMIN_PASSWORD`, changed after first login; 2FA enabled for admins.
- [ ] Railway Postgres backups enabled; manual `pg_dump` taken right before launch.
- [ ] `/api/health/` is green; the cron service is running.
- [ ] Lighthouse on the home, article and business pages: Performance ≥ 85, Accessibility ≥ 95, SEO ≥ 95.

## Go live
- [ ] Write down the current DNS records (for rollback).
- [ ] Final import run on production.
- [ ] Switch DNS, set `APP_URL`, redeploy, submit the sitemap in Search Console.
- [ ] Keep WordPress hosting for 30+ days.

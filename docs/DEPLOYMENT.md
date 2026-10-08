# Deploying TCountySpotlight on Railway

## 1. Create the project (staging first)
1. In Railway: **New Project → Deploy from GitHub repo** → `cgw2422/t-county-spotlight`, branch `claude/great-cannon-8a3tog` (or `main` once merged).
2. **Add → Database → PostgreSQL** in the same project.
3. *(Recommended)* **Add → Bucket** (Railway object storage) for images. Copy its credentials into the S3 variables below. Without a bucket, images are stored in PostgreSQL. That works and is persistent, but it makes the database larger.
4. In the web service → **Variables**, set (see `.env.example` for all):
   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
   | `APP_URL` | the Railway URL, e.g. `https://tcountyspotlight-staging.up.railway.app` |
   | `ADMIN_EMAIL` / `ADMIN_PASSWORD` | your first admin login (created once) |
   | `WP_BASE_URL` | `https://tcountyspotlight.com` |
   | `WP_USERNAME` / `WP_APP_PASSWORD` | optional, for drafts/scheduled posts |
   | `S3_*` | bucket credentials (optional) |
   | `SMTP_*` | email provider (optional for staging; resets are logged without it) |
   | `CRON_SECRET` | random string |
5. **Settings → Networking → Generate Domain.** Deploy.

`railway.json` already configures:
- build `npm run build` (`prisma generate && next build`)
- pre-deploy `npm run release` (`prisma migrate deploy && prisma db seed`). `migrate deploy` only applies new migrations and never resets or wipes data. The seed only inserts missing configuration rows.
- start `npm run start`
- health check `/api/health/`

## 2. Import WordPress content
Sign in at `/login/` with the admin account. Go to **Admin → WordPress Import** and click **Start import**. The import runs on the Railway server, which can reach tcountyspotlight.com. Review the migration report when it finishes. See `docs/MIGRATION.md`.

## 3. Scheduled jobs
Add a second Railway service from the same repo (or a Railway Cron) running every 5–15 minutes:
```
curl -fsS -H "Authorization: Bearer $CRON_SECRET" "$APP_URL/api/cron/"
```
This publishes scheduled articles and cleans up expired sessions.

## 4. Stripe (only after you approve plans and pricing)
1. Create Products/Prices in Stripe **test mode**, then paste each Price ID into **Admin → Memberships**.
2. Add a webhook endpoint `https://<domain>/api/stripe/webhook/` (note the trailing slash) for: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid` and `invoice.payment_failed`.
3. Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.
4. Turn on **Admin → Settings → Payments → Enable payments** and activate the plans.
5. Test end-to-end with Stripe test cards before switching to live keys.

## 5. Backups
- Railway Postgres: enable **Backups** on the database service (daily) in the service settings.
- Before every major change, take a manual dump: `pg_dump "$DATABASE_URL" -Fc -f tcs-$(date +%F).dump`.
- Restore: `pg_restore --clean --no-owner -d "$DATABASE_URL" tcs-YYYY-MM-DD.dump`.

## 6. Environments
Use Railway **Environments** (staging and production) in the same project. Each has its own Postgres, bucket and variables. Promote by merging to the production branch.

## 7. Domain launch (only after sign-off)
1. Run a final WordPress import on production (it is idempotent and only updates changed records).
2. Work through `docs/LAUNCH_CHECKLIST.md`.
3. Lower the DNS TTL for tcountyspotlight.com to 300s a day ahead.
4. In Railway → service → **Custom Domain**, add `tcountyspotlight.com` and `www.tcountyspotlight.com`, then create the CNAME/ALIAS records it shows at your DNS provider.
5. Set `APP_URL=https://tcountyspotlight.com` and redeploy.
6. Submit `https://tcountyspotlight.com/sitemap.xml` in Google Search Console.

### Rollback
Keep the WordPress hosting active for at least 30 days. To roll back, point the DNS records back to the previous WordPress host values (write them down before step 4). No data is lost: WordPress is never modified by this project.

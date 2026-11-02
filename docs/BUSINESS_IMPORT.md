# One-time business import (Tuscarawas County)

A simple, reusable script pair. There is no admin page, scheduled job or sync. Re-run it only when you want another batch.

**Source:** [OpenStreetMap](https://www.openstreetmap.org/copyright) through the Overpass API. OpenStreetMap is open data under the ODbL 1.0 license, which requires the attribution "© OpenStreetMap contributors". Imported profiles show that credit automatically.
- Google Maps is **not** used. No Google content is scraped or stored.
- Other directories (Chamber, Yelp, Yellow Pages) are not used, because their terms don't allow copying listings.
- An Ohio Secretary of State bulk filing export could be added later as a second source, but it lists registered-agent addresses rather than storefronts.

## Step 1: build the review CSV (writes nothing to the database)
```bash
npm run businesses:fetch          # or: npm run businesses:fetch -- --input saved-overpass.json
```
Creates `data/business-import/<timestamp>/candidates.csv` and `duplicate-report.md`.
- **Data collected:** name, category (mapped to T County Connect categories), address, town (taken from the ZIP when missing), state, ZIP, phone and website.
- **Source columns:** source, OSM id and link, and license.
- **Review columns:** `missing_fields` and `review_flags` (chain/brand, out-of-county ZIP, no category).
- **Duplicates:** detected both within the OpenStreetMap results and against existing T County Connect listings. A match on name and town, phone, website, or street address counts; matches are never imported.
- **Default answers:** `approve` is pre-filled `yes` only for complete, local, non-duplicate records, and `no` for everything else.

## Step 2: review
Open `candidates.csv` in Excel or Google Sheets. Set `approve` to `yes` or `no`, fix any names, categories, addresses, phones or websites, and save as CSV.

## Step 3: dry run, then import
```bash
npm run businesses:import -- --file data/business-import/<run>/candidates.csv            # dry run: writes nothing
npm run businesses:import -- --file data/business-import/<run>/candidates.csv --commit   # import
```
- **What gets imported:** only `approve = yes` rows. Each row is re-checked against the live database first, and duplicates are skipped. Existing listings, articles, images and relationships are never modified.
- **How new listings are set up:** published (or add `--draft`), free listing (no subscription), unclaimed (no owner), not featured, not spotlighted. No user accounts are created and no emails are sent. Owners can claim through "Claim this listing".
- **Safe to repeat:** rows already imported from the same OpenStreetMap record are skipped.
- **Report:** `import-report-dry-run.md` or `import-report-committed.md`, listing records added, skipped (with reasons) and added-but-flagged. An audit-log entry `business.bulk_import` is written.

## Running against production (Railway)
The scripts use whichever database `DATABASE_URL` points to. For production:
1. Commit the reviewed CSV to the repo, under `data/business-import/…`, and let Railway deploy.
2. Run `railway ssh` (or Railway → service → Shell).
3. Run `npm run businesses:import -- --file data/business-import/<run>/candidates.csv` to dry-run against production and review the report.
4. Run the same command with `--commit`.

## Removing a batch (if ever needed)
Imported rows carry `wpMeta.import.batch` (e.g. `osm-2026-11-02`), so a batch can be identified and archived from Admin → Businesses.

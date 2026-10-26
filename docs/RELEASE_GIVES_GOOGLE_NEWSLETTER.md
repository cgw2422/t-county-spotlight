# Release: T-County Gives, Churches, Google Reviews, T-County Weekly

Status: **built on branch, not deployed.** It needs owner approval before production.

## Database migration `20261026132335_gives_google_newsletter`
The migration is purely additive. It drops, renames and rewrites nothing. Existing articles, businesses, events, users and memberships are untouched.

**New columns on existing tables (all nullable or defaulted):**
| Table | Column | Purpose |
|---|---|---|
| `Business` | `googlePlaceId` (text, null) | Google Maps Place ID (the only Google data stored long-term) |
| `Business` | `googleMapsUrl` (text, null) | Link to the Google listing |
| `Business` | `googleReviewsEnabled` (bool, default true) | Show or hide the Google reviews link or card |
| `Business` | `googlePlaceVerifiedAt` (timestamp, null) | Set when the Place ID was checked against the Places API |
| `Event` | `organizationId` (text, null; FK → Organization, on delete SET NULL) | Events hosted by a nonprofit or church |

**New tables:**
- **T-County Gives:**
  - `Organization` (kind NONPROFIT, CHURCH or COMMUNITY_GROUP; church fields included; status and verification)
  - `OrganizationMember`, `OrganizationUpdate`
  - `CommunityNeed`, `NeedPledge` (personal data)
  - `VolunteerOpportunity`, `VolunteerSignup` (personal data)
- **Newsletter:**
  - `NewsletterSubscriber`
  - `EmailSuppression` (permanent do-not-email list)
  - `SubscriberEvent` (activity history)
  - `Newsletter` (campaigns)
  - `NewsletterSend` (unique per campaign and subscriber, which prevents duplicate sends)

**New enums:** OrgKind, OrgStatus, OrgMemberRole, NeedCategory, NeedUrgency, NeedStatus, PledgeStatus, OpportunityStatus, SignupStatus, SubscriberStatus, NewsletterStatus, SendStatus.

**Seed (configuration only, runs on start):**
- Adds homepage sections `gives` and `newsletter` at the end of your current order, if they are missing.
- Adds menu links "T-County Gives" and "Churches" (header and mobile) and "T-County Weekly newsletter" (footer), each only if no link to that URL exists. You can remove or reorder them in Admin → Menus.

**How it is applied:** `prisma migrate deploy` on app start. Before deploying, take a backup: `pg_dump "$DATABASE_URL" -Fc -f pre-gives.dump`.

## External services and credentials
| Service | Variables | Required? | Notes |
|---|---|---|---|
| **Resend** (recommended email provider) | `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` | Required to send newsletters. Without it, newsletters cannot be sent; confirmations fall back to SMTP or are only logged. | Verify your sending domain (SPF, DKIM, DMARC records at your DNS host). Webhook URL: `https://<domain>/api/newsletter/webhook/` (trailing slash) for delivered, bounced, complained, opened and clicked events. |
| Newsletter settings (Admin → Newsletter → Settings) | none | Required before a broadcast | From name and address, and a **physical postal mailing address** (required by CAN-SPAM). |
| **Google Places API (New)** | `GOOGLE_PLACES_API_KEY` | Optional | One server-side key for the whole site. Enable "Places API (New)", restrict the key to that API, and set a billing budget alert. Without it, profiles show a "Read Reviews on Google" link only. |
| Cron (already set up) | `CRON_SECRET` | Recommended | `/api/cron/` now also sends scheduled newsletters in safe batches. |

## Security update included
Next.js was upgraded from 16.4.0 to **16.4.3** to fix critical advisories, including GHSA-2464-fhr4-w9xw (remote code execution via image optimization) and GHSA-p3m5-59mp-jv5r. Non-breaking `npm audit fix` updates were applied to zod and Prisma's dependencies.

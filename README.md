# T County Connect

_Formerly TCountySpotlight. Discover more of T County._

Community platform for Tuscarawas County, Ohio. It covers local businesses, business spotlights, events, specials, jobs, and dashboards for admins and business owners. It replaces the WordPress site at tcountyspotlight.com. See [docs/REBRAND_T_COUNTY_CONNECT.md](docs/REBRAND_T_COUNTY_CONNECT.md) for the brand system.

## Quick start (local)
```bash
cp .env.example .env          # set DATABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD
npm install
npx prisma migrate dev        # creates tables
npm run db:seed               # categories, homepage sections, menus, plans, first admin
npm run dev                   # http://localhost:3000  (admin at /admin/)
```

Import WordPress content: `npm run migrate:wp`, or use Admin → WordPress Import. See [docs/MIGRATION.md](docs/MIGRATION.md).

## Docs
- [docs/PLAN.md](docs/PLAN.md): audit, design direction, architecture, data model
- [docs/MIGRATION.md](docs/MIGRATION.md): WordPress migration
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md): Railway, environment variables, backups, DNS, rollback
- [docs/LAUNCH_CHECKLIST.md](docs/LAUNCH_CHECKLIST.md)
- [docs/CONVENTIONS.md](docs/CONVENTIONS.md): code conventions

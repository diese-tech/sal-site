# Serpent Ascension League

The **Serpent Ascension League (SAL)** website is the public and operational web platform for a community-run competitive **SMITE 2** league.

**Live site:** https://sal-draft-league.vercel.app  
**Discord:** https://discord.gg/qY8uFve4Dd  
**Twitch:** https://twitch.tv/serpentascensionleague

SAL is not affiliated with Hi-Rez Studios or the SMITE franchise.

> **Status:** Active league platform. The site is deployed on Vercel and shares its authoritative Supabase contract with the separate SAL bot and database repositories.

## What the Site Does

### Public league experience

- Live and upcoming match visibility
- Division standings and schedules
- Team and roster pages
- Player directory and profiles
- League announcements
- Twitch viewing surface
- Season registration and Discord-linked player claiming

### League operations

Authorized admins and captains use the site for workflows including:

- roster and team management;
- schedule and result administration;
- standings recalculation;
- live draft operations;
- player registration review;
- match-report and stat-correction workflows;
- announcement publishing;
- bulk player import.

## System Boundaries

SAL is split across three repositories with intentionally separate ownership:

```text
Discord users ──► lab-salbot ──► Supabase ◄── sal-site
                                      ▲
                                      │
                                sal-database
                              schema/contract owner
```

- **This repository (`sal-site`)** owns the Next.js website and web control surfaces.
- [`diese-tech/lab-salbot`](https://github.com/diese-tech/lab-salbot) owns Discord workflow intake and bot-side operations.
- [`diese-tech/sal-database`](https://github.com/diese-tech/sal-database) is the sole owner of active Supabase migrations, generated types, schema releases, and production database pushes.

The website consumes the locked database contract rather than independently evolving shared schema.

## Tech Stack

- Next.js
- TypeScript
- Supabase/PostgreSQL
- Discord OAuth
- Vercel
- Vitest + Playwright

## Local Development

### Requirements

- Node.js 24 LTS
- npm
- Supabase environment configured from `.env.example`

### Start locally

```bash
cp .env.example .env.local
npm install
npm run dev
```

For full environment setup and technical onboarding, see [`DEVELOPMENT.md`](./DEVELOPMENT.md).

## Validation

Common project checks include:

```bash
npm run test
npm run test:e2e
npm run test:integration
npm run test:load
npm run check:bem
```

CI also performs lint/type checking, dependency auditing, secret scanning, builds, and the configured test suites. See [`docs/ci.md`](docs/ci.md) for the current pipeline and recovery-gated checks.

## Documentation

Start here:

- [`DEVELOPMENT.md`](./DEVELOPMENT.md) — local development and environment setup
- [`docs/draft-platform-guide.md`](docs/draft-platform-guide.md) — accepted draft behavior and repository boundaries
- [`docs/frontend-styling.md`](docs/frontend-styling.md) — frontend styling conventions
- [`docs/ci.md`](docs/ci.md) — CI and validation model
- [`docs/audit-status.md`](docs/audit-status.md) — current audit findings and issue links

Keep deep operational procedures in `docs/` rather than expanding the root README into a runbook.

## Security and Data Boundaries

- Service-role and admin secrets are server-only.
- Discord OAuth is the preferred administrator/captain identity path where configured.
- Shared database changes belong in `sal-database`, not application-local migrations.
- Public pages must not depend on staging/review data before approval.
- Automated CI success does not replace production/runtime verification for changes that explicitly require it.

## License

This repository is source-available under the proprietary terms in [`LICENSE`](LICENSE). It is **not open source**.

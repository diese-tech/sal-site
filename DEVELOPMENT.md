# SAL — Local Development

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, server components) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| Database | Supabase (PostgreSQL) |
| Auth | HMAC-SHA256 cookie (admin) + Supabase Auth / Discord OAuth (players) |
| Hosting | Vercel |

---

## Prerequisites

- Node.js 24 LTS
- A Supabase project (free tier is fine)
- A Discord OAuth application (only needed for player sign-in)

---

## Environment Variables

Create a `.env.local` file in the project root:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Admin panel
ADMIN_SESSION_SECRET=a-long-random-string-min-32-chars
ADMIN_PASSWORD=your-admin-password

# Twitch (optional — /watch page works without this, shows offline state)
TWITCH_CHANNEL=serpentascensionleague
TWITCH_CLIENT_ID=
TWITCH_CLIENT_SECRET=
```

**Where to find these:**
- `NEXT_PUBLIC_SUPABASE_URL` and keys: Supabase dashboard → Settings → API
- `ADMIN_SESSION_SECRET`: generate with `openssl rand -hex 32`
- Twitch credentials: Twitch Developer Console → your application

> Local development and E2E runs can use mock data without Supabase configured.
> Production does not serve mock league data when Supabase is unavailable. Admin
> mutations require a real Supabase connection.

---

## Database setup

Do not build a new shared database by running `supabase/schema.sql` and the site
and bot migration folders. Those pre-v1 sequences are interdependent and cannot
reproduce the current shared schema from empty.

[`diese-tech/sal-database`](https://github.com/diese-tech/sal-database) is the
approved sole owner for Supabase migrations, generated types, contract releases,
and production pushes. Its initial `db-v1.0.0` contract is intentionally blocked
on the recovery drill in [#156](https://github.com/diese-tech/sal-site/issues/156)
and canonical-baseline work in
[#172](https://github.com/diese-tech/sal-site/issues/172); no released v1 contract
is being claimed yet.

Until that release exists, use a maintainer-provided scratch project restored
from the approved recovery process for database-backed development. The local
mock-data path remains available for site-only work. Existing files under
`supabase/` are transition evidence, not a supported blank-database bootstrap.

---

## Running Locally

```bash
npm install
npm run dev
```

Open http://localhost:3000

The admin panel is at http://localhost:3000/admin. Use Discord OAuth when it is
configured; `ADMIN_PASSWORD` is a temporary local/break-glass fallback tracked by
[#155](https://github.com/diese-tech/sal-site/issues/155).

---

## Key Directories

```
src/
  app/                  # Next.js App Router pages and API routes
    admin/              # Admin panel pages
    api/                # API routes (admin/*, auth/*, draft/*)
    auth/               # OAuth sign-in, callback, error pages
    register/           # Player registration (Flow A/B)
  components/
    admin/              # Admin UI components
    auth/               # Auth UI (sign-in button, register form, user menu)
    card-lab/           # Design lab components
    league/             # Public-facing league components (cards, panels, tables)
    nav/                # Site navigation + ticker bar
    ui/                 # Shared UI (MarkdownBody, etc.)
  lib/
    admin-auth.ts       # HMAC session cookie logic
    league-data.ts      # All Supabase read/write functions
    supabase-server.ts  # Service-role Supabase client
    supabase-browser.ts # Anon-key browser client (for Discord OAuth)
    supabase-auth-server.ts  # Server-side session reading
  types/
    league.ts           # Core league types
    auth.ts             # Registration and form field types
    card-lab.ts         # Player role and status enums
supabase/
  schema.sql            # Pre-v1 transition evidence; not the canonical baseline
  migrations/           # Pre-v1 transition evidence; see migrations/README.md
```

---

## Discord OAuth Setup

To enable player sign-in locally:

1. Go to discord.com/developers/applications → New Application
2. Under OAuth2 → Redirects, add: `http://localhost:3000/auth/callback`
3. In Supabase dashboard → Authentication → Providers → Discord: enable and paste the Client ID and Secret
4. Add `NEXT_PUBLIC_SUPABASE_ANON_KEY` to `.env.local`

Without this, the Sign In button renders but OAuth won't complete.

---

## Build Check

```bash
npm run build
```

The build must pass with zero TypeScript errors before any PR is merged.

---

## Design Lab

The design lab routes (`/lab/cards`, `/lab/editor`) are unprotected in development and use mock data only. They are not connected to Supabase and require no auth. In production they redirect away (guarded by `NODE_ENV` check).

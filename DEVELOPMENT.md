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

- Node.js 20+
- A Supabase project (free tier is fine)
- A Discord OAuth application (only needed for player sign-in)

---

## Environment Variables

Create a `.env.local` file in the project root:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
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

> The app runs without Supabase configured — it falls back to mock data for public pages. Admin mutations will fail without a real Supabase connection.

---

## Database Setup

Run these SQL files in order in the Supabase SQL editor:

1. `supabase/schema.sql` — base tables (seasons, divisions, orgs, players, matches, standings, announcements)
2. `supabase/migrations/001_admin_audit_log.sql` — admin audit log table
3. `supabase/migrations/002_draft_engine.sql` — draft rooms and picks tables
4. `supabase/migrations/003_rls.sql` — Row Level Security policies
5. `supabase/migrations/004_auth.sql` — player Discord identity, registrations, form fields

After running migrations, seed the database:

```bash
npm run db:seed
```

This imports the current mock league data (Season 1 orgs, players, schedule).

---

## Running Locally

```bash
npm install
npm run dev
```

Open http://localhost:3000

The admin panel is at http://localhost:3000/admin — log in with the `ADMIN_PASSWORD` you set in `.env.local`.

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
  schema.sql            # Base schema
  migrations/           # Numbered migration files
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

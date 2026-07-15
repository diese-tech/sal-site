# Migrations: ownership & apply runbook

**`sal-site/supabase/migrations/` is the single authoritative migration
sequence for the shared production Supabase project.** This holds even for
schema changes that originate from `lab-salbot` work (e.g. bot-owned tables,
role-mapping config, stat pipelines) — if it touches the shared database, the
migration file lives here.

This is Decision **D-1** from
[`docs/audit-production-readiness-2026-07-14.md`](../../docs/audit-production-readiness-2026-07-14.md),
recorded after proven drift: `lab-salbot`'s `division_role_mappings`
migration (authored 2026-07-08) sat unapplied in production until
2026-07-13, silently breaking `/division-role-config` and the role-sync half
of `/division-sync` the entire time. Migrations split across two repos, with
no shared ledger and interleaved ordering (e.g. this repo's migration `008`
creates RLS policies on the bot-created `player_stats` table), is what let
that drift happen unnoticed.

`lab-salbot/database/migrations/` still has 4 pre-existing legacy files.
Those are **not** being backported now — they're slated for a post-season
consolidation into this sequence (folding lab-salbot's migrations in and
retiring its migrations directory). Until that consolidation happens,
**no new migrations should be added to `lab-salbot/database/migrations/`**;
every new schema change, regardless of which repo's feature it supports,
gets its file added here instead.

## Writing a new migration

1. Find the current highest number in this directory:
   ```bash
   ls supabase/migrations/ | sort | tail -1
   ```
2. Name the new file `NNN_description.sql`, where `NNN` is the highest
   existing number + 1, zero-padded to 3 digits (e.g. highest is `021`, so
   the next file is `022_your_description.sql`). Use a short,
   lowercase-with-underscores description of what the migration does.
3. Write the migration as plain SQL (DDL, RLS policies, RPCs, seed data,
   etc.), following the style of existing files in this directory.
4. Get it reviewed like any other change in this repo — a migration is
   product code even though it's SQL.

## Applying a migration to the shared project

1. Confirm you're applying to the correct (shared) Supabase project — there
   is one production project shared by both `sal-site` and `lab-salbot`.
2. Apply via the Supabase CLI (preferred) or the SQL editor in the Supabase
   dashboard, running the new file's contents against the project.
3. Verify the migration is recorded in `supabase_migrations.schema_migrations`
   (see the parity check below) — don't just trust that the `apply` command
   returned success.
4. Update anyone/anything that depends on the change (bot restart if it
   reads schema at startup, docs, etc.).
5. Note the applied migration in the launch/Go-No-Go checklist or PR
   description so there's a paper trail of *when* it landed in prod, not
   just that it exists in the repo — this is exactly the gap that let the
   `division_role_mappings` drift go unnoticed for 5 days.

## Parity check

Before any launch-window change, and as a standing item on the Go/No-Go
checklist, confirm the repo's migration sequence matches what's actually
applied in production. Two ways to do this:

**A. Compare row count / latest version**

```sql
-- Run against the shared production project
select version, name
from supabase_migrations.schema_migrations
order by version desc
limit 25;
```

```bash
# Run locally, from repo root
ls supabase/migrations/*.sql | sort
```

Compare the two lists by eye: every file in `supabase/migrations/` should
have a corresponding row in `schema_migrations` (matched by the leading
number/timestamp), and there should be no rows in `schema_migrations` that
don't correspond to a file in this directory (that's a sign a migration was
applied manually, or applied from `lab-salbot`, and never captured here).

**B. One-shot diff (if using the Supabase CLI)**

```bash
supabase migration list --linked
```

This prints applied-vs-local status per migration directly; anything marked
as applied-but-missing-locally (or local-but-not-applied) is drift — resolve
it before proceeding with the launch-window change.

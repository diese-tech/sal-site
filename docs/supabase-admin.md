# Supabase Admin Setup

## Project

The Supabase project URL is configured via the `NEXT_PUBLIC_SUPABASE_URL` environment variable. Set this in Vercel (production) and `.env.local` (local dev).

## Initial Setup

Run `supabase/schema.sql` first, then **every** file in `supabase/migrations/` in
numeric order (001 through 021 at time of writing) in the Supabase SQL editor.
Highlights:

| File | Purpose |
|---|---|
| `supabase/schema.sql` | Base tables: seasons, divisions, orgs, players, matches, standings, announcements, gods, god drafts |
| `001_admin_audit_log.sql` | Admin audit log — records every admin mutation |
| `002_draft_engine.sql` | Draft rooms, draft picks, and captain tokens |
| `003_rls.sql` | Row Level Security — anon key gets SELECT only on public tables |
| `004_auth.sql` | Player Discord identity (`discord_id`, `profile_claimed`), registrations, form fields |
| `016_atomic_match_report_stats.sql` | `replace_match_report_stats` RPC (match_reports / player_match_stats) |
| `017_atomic_standings_replace.sql` | `replace_standings` RPC — atomic standings replace |
| `018_seed_divisions.sql` | Seeds the fixed division rows (`solar`, `lunar`, `terra`) |

The shared database also carries SALbot's migrations — a fresh project needs those
applied too, from the `lab-salbot` repo's `database/migrations/`. **Ordering
matters:** site migration `008_player_stats_read.sql` creates policies on
`player_stats` and `gods`, and `player_stats` only exists once SALbot's initial
migration has run — apply SALbot's migrations before 008 on a fresh project.

After the schema is applied, seed the database with Season 1 data:

```bash
npm run db:seed
```

## Environment Variables

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your project URL (`https://[ref].supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key — safe to expose, used for Discord OAuth session |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key — **never expose client-side**, bypasses RLS |

## Row Level Security

RLS is enabled on all tables. The policies are:

- **Public tables** (seasons, divisions, orgs, players, matches, standings, announcements, draft_rooms, draft_picks): `anon` key can SELECT; no INSERT/UPDATE/DELETE
- **registrations**: `anon` key can INSERT (to submit sign-ups); no SELECT (admin reads via service_role)
- **form_fields**: `anon` key can SELECT (needed to render the public registration form)
- **admin_audit_log**, **captain_tokens**: no public access; service_role only

The server always uses the service_role key which bypasses RLS entirely. RLS only affects direct API calls with the anon key.

## Admin Capabilities

All admin mutations go through Next.js API routes that verify the admin session cookie before writing to Supabase. The service_role key is only used server-side.

| Operation | API Route |
|---|---|
| Save / update a match | `POST /api/admin/matches` |
| Save / update a player | `POST /api/admin/players` |
| Recalculate standings | `POST /api/admin/recalculate-standings` |
| Create / update announcement | `POST /api/admin/announcements` |
| Delete announcement | `DELETE /api/admin/announcements/[id]` |
| Batch import players | `POST /api/admin/import/players` |
| Update registration status | `PATCH /api/admin/registrations/[id]` |
| Save / update form field | `POST /api/admin/form-fields` |
| Delete form field | `DELETE /api/admin/form-fields?id=[id]` |

Every mutation is logged to `admin_audit_log` with the action type, entity type, entity ID, and a JSON payload snapshot.

## Standings Recalculation

Standings are recalculated in exactly one place: on demand from Admin → Standings
(`POST /api/admin/recalculate-standings`).

No match-completion path recalculates automatically:

- `POST /api/admin/matches` (the Admin → Matches editor) saves the match but does
  **not** recalculate, despite the editor's confirmation copy.
- `POST /api/admin/match-reports/[id]/submit` imports
  `recalculateAndPersistStandings` but never calls it, so submitting a match report
  does not recalculate either.
- SALbot's Discord approval flow completes matches without touching standings.

After completing a match through **any** flow, recalculate from Admin → Standings or
the public standings stay stale.

The recalculation fetches match and org data directly from Supabase (bypassing the mock fallback), then atomically replaces the standings rows via the `replace_standings` RPC. This is safe to run multiple times.

## Audit Log

Every admin write is recorded in `admin_audit_log`. You can view the last 50 entries from the admin overview page, or query directly in Supabase:

```sql
SELECT * FROM admin_audit_log ORDER BY created_at DESC LIMIT 50;
```

Note there are **two** audit trails in the shared database: `admin_audit_log`
(website admin actions) and `audit_logs` (SALbot mutations). They are separate by
design.

## Shared Database with SALbot

The same Supabase project is used by SALbot (the `lab-salbot` repo), which connects
with the service role key. Full details live in `lab-salbot/docs/database/schema.md`;
the contract summary from the site's perspective:

**Bot-owned tables** — the site never reads or writes these: `pending_actions`
(Discord approval queue), `audit_logs`, `pending_stat_records`,
`division_role_mappings`. The bot's migrations in `lab-salbot/database/migrations/`
create them and add columns to `matches` (`winner_org_id`, `score`,
`proof_thread_id`, `proof_thread_url`, `screenshot_count`, `screenshot_expected`)
plus `players.display_alias`.

**`player_stats` is bot-written but site-read.** Only the bot's approval handler
writes rows, but `src/lib/stats-data.ts` reads them for the public player, team, and
gods pages, served under the anon `player_stats_public_read` policy from migration
008. Schema or RLS changes to this table affect the public site directly.

**Match completion has two writers.** SALbot approval sets `matches.status`,
`winner_org_id`, `home_score`, `away_score`, and `score`; the site's admin flows set
`status` / `home_score` / `away_score` only, leaving `winner_org_id` and `score`
NULL. Neither writer updates `standings` (see Standings Recalculation above). Site
upserts to `matches` send only the site-owned columns, so PostgREST leaves the
bot-owned columns intact.

**Player stats have two pipelines.** SALbot's pipeline
(`pending_stat_records` → `player_stats` → recomputed `players.stats` aggregate)
feeds everything stat-related the public site shows: headline numbers come from the
`players.stats` aggregate and match history / team / god breakdowns come from
`player_stats` directly. The site's admin match-report flow writes `match_reports`
+ `player_match_stats`, which do not feed `players.stats` and are not currently
rendered anywhere public.

**Identity linking.** Both systems match players by `players.discord_id`: the site
sets it via the Discord OAuth claim flow, the bot via `/division-sync` CSV apply.
Captain-only bot commands (`/report-result`, `/reschedule`) resolve the caller by
`discord_id` + `is_captain`, so captains must be linked and flagged on the site for
those commands to work.

**Division ids** are the fixed set `solar` / `lunar` / `terra` (renamed from `gaia`
on 2026-07-13; the `divisions_id_check` constraint enforces it). The bot maps
division ids to Discord channels via `CHANNEL_RESULTS_*` / `CHANNEL_RESCHEDULES_*`
env vars and to Discord roles via the `division_role_mappings` table.

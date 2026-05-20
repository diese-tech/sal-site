# Supabase Admin Setup

## Project

The Supabase project URL is configured via the `NEXT_PUBLIC_SUPABASE_URL` environment variable. Set this in Vercel (production) and `.env.local` (local dev).

## Initial Setup

Run the following SQL files **in order** in the Supabase SQL editor:

| Order | File | Purpose |
|---|---|---|
| 1 | `supabase/schema.sql` | Base tables: seasons, divisions, orgs, players, matches, standings, announcements |
| 2 | `supabase/migrations/001_admin_audit_log.sql` | Admin audit log — records every admin mutation |
| 3 | `supabase/migrations/002_draft_engine.sql` | Draft rooms, draft picks, and captain tokens |
| 4 | `supabase/migrations/003_rls.sql` | Row Level Security — anon key gets SELECT only on public tables |
| 5 | `supabase/migrations/004_auth.sql` | Player Discord identity (`discord_id`, `profile_claimed`), registrations table, form fields table |

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

Standings are recalculated automatically whenever a completed match score is saved via `POST /api/admin/matches`. They can also be manually triggered from Admin → Standings.

The recalculation fetches match and org data directly from Supabase (bypassing the mock fallback), then upserts recalculated standings and removes any stale org rows. This is safe to run multiple times.

## Audit Log

Every admin write is recorded in `admin_audit_log`. You can view the last 50 entries from the admin overview page, or query directly in Supabase:

```sql
SELECT * FROM admin_audit_log ORDER BY created_at DESC LIMIT 50;
```

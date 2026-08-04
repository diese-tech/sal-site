-- CI-ONLY fixture. Never run this against a real/shared Supabase project.
--
-- supabase/schema.sql (tracked in this repo as pre-v1 transition evidence, see
-- supabase/migrations/README.md and DEVELOPMENT.md) captures most of the tables that
-- this repo's numbered migrations assume already exist -- they are owned by the
-- separate shared-schema project (see issue #172 / diese-tech/sal-database), not by
-- this repo. schema.sql is not fully up to date with that shared schema though:
-- three tables were added to the live project after schema.sql was last touched, the
-- same "unowned DDL" situation 025_shared_schema_alignment.sql documents and folds in
-- for match_reports/player_match_stats:
--
--   - org_brands      -- 011_god_draft_schema_complete.sql enables RLS + adds a policy
--   - player_stats    -- 008_player_stats_read.sql adds a SELECT policy
--   - pending_actions -- 022_pending_result_uniqueness.sql adds a partial unique index
--
-- players.avatar_url and registrations.avatar_url are the same situation applied to
-- columns rather than whole tables: diese-tech/sal-database added avatar_url to both
-- live tables (Discord avatar capture, #236) after schema.sql/004_auth.sql last
-- touched their shape.
--
-- Column shapes below are taken from the generated src/types/database.types.ts (the
-- checked contract for the live schema, see scripts/db-contract.mjs) restricted to the
-- columns those migrations actually touch or reference. This file plus schema.sql are
-- concatenated ahead of supabase/migrations/*.sql only inside the ephemeral CI/local
-- Supabase stack (see .github/workflows/ci.yml, integration-tests job) so the numbered
-- migrations -- which are otherwise not a blank-database bootstrap -- can be replayed
-- end-to-end to exercise RLS. All statements are IF NOT EXISTS so this is a no-op if
-- ever pointed at a project where these tables are already real.

create table if not exists org_brands (
  id  text primary key,
  name text not null,
  tag  text not null
);

-- players.avatar_url / registrations.avatar_url: Discord avatar capture (#236)
-- added these columns to the live, externally-owned schema after schema.sql
-- (players) and supabase/migrations/004_auth.sql (registrations) were last
-- touched. 004_auth.sql is frozen historical evidence (see
-- supabase/migrations/README.md) and must not be edited, so registrations is
-- shadow-created here with its full current shape, ahead of 004_auth.sql's
-- own CREATE TABLE IF NOT EXISTS -- which becomes an inert no-op once this
-- runs first, same pattern as player_stats/pending_actions below.
alter table players add column if not exists avatar_url text;

create table if not exists registrations (
  id text primary key,
  discord_id text not null unique,
  discord_username text not null,
  discord_display_name text,
  season_id text references seasons(id) on delete set null,
  player_id text references players(id) on delete set null,
  avatar_url text,
  form_data jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewer_note text
);

-- Matches 008_player_stats_read.sql's description: "created by the salbot migration
-- with RLS enabled but no SELECT policy".
create table if not exists player_stats (
  id                     uuid primary key default gen_random_uuid(),
  match_id               text not null references matches(id),
  player_id              text not null references players(id),
  pending_stat_record_id uuid,
  game_number            integer not null default 1,
  god_played             text,
  role                   text,
  won                    boolean,
  kills                  integer,
  deaths                 integer,
  assists                integer,
  damage_dealt           integer,
  damage_mitigated       integer,
  healing_done           integer,
  created_at             timestamptz not null default now()
);
alter table player_stats enable row level security;

create table if not exists pending_actions (
  id                       uuid primary key default gen_random_uuid(),
  type                     text not null,
  status                   text not null default 'pending',
  match_id                 text references matches(id),
  division_id              text references divisions(id),
  requested_by_discord_id  text not null,
  payload_json             jsonb not null default '{}'::jsonb,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- Matches 008's description of gods' production shape (RLS enabled, no SELECT policy)
-- before 010_god_draft_realtime.sql/008 add rows and a read policy on top of the table
-- schema.sql already created.
alter table gods enable row level security;

-- god_draft_sessions is created by schema.sql/010 without RLS, and neither of the
-- migrations replayed here ever enables it -- 011 only adds a SELECT policy, which is
-- inert while RLS is off. Production has RLS enabled (confirmed against
-- diese-tech/sal-database's canonical baseline migration) plus a broad GRANT to anon;
-- RLS is the only thing stopping anon from writing. Without this, api.auto_expose_new_tables
-- would let the local anon role mutate draft sessions in a way production never allows,
-- so this required gate would pass against a materially weaker security model.
alter table god_draft_sessions enable row level security;

-- 010_god_draft_realtime.sql and 011_god_draft_schema_complete.sql both do
-- `ALTER PUBLICATION supabase_realtime ADD TABLE ...`, guarded only against the table
-- already being a publication member (duplicate_object). On the live/hosted project this
-- publication is created ahead of time by the Supabase platform itself, outside any
-- migration in this repo, so it's always present by the time these migrations run. A raw
-- Postgres instance -- or a local CLI stack for some reason missing it -- would not have
-- it, and the ALTER PUBLICATION would fail with "publication does not exist" instead of
-- the guarded duplicate-object case. Create it defensively so the migration replay does
-- not depend on that assumption.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

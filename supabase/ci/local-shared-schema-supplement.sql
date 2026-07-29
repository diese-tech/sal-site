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

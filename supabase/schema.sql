create table if not exists seasons (
  id text primary key,
  name text not null,
  status text not null check (status in ('pre-season', 'active', 'post-season', 'offseason')),
  start_date date not null,
  end_date date not null,
  current_week integer not null default 1
);

create table if not exists divisions (
  id text primary key check (id in ('solar', 'lunar', 'terra')),
  name text not null,
  description text not null,
  tier integer not null,
  accent_color text not null
);

create table if not exists orgs (
  id text primary key,
  name text not null,
  tag text not null,
  division_id text not null references divisions(id),
  logo_initials text not null,
  logo_gradient text not null,
  primary_color text not null,
  accent_gradient text not null,
  captain_id text,
  founded text,
  social_links jsonb
);

create table if not exists players (
  id text primary key,
  org_id text references orgs(id) on delete set null,
  discord_username text not null,
  ign text not null,
  avatar_initials text not null,
  avatar_gradient text not null,
  primary_role text not null,
  secondary_roles jsonb not null default '[]'::jsonb,
  is_starter boolean not null default false,
  is_captain boolean not null default false,
  division_id text references divisions(id),
  status text not null,
  stats jsonb
);

alter table orgs
  drop constraint if exists orgs_captain_id_fkey;

alter table orgs
  add constraint orgs_captain_id_fkey foreign key (captain_id) references players(id) deferrable initially deferred;

create table if not exists matches (
  id text primary key,
  division_id text not null references divisions(id),
  home_org_id text not null references orgs(id),
  away_org_id text not null references orgs(id),
  scheduled_date date not null,
  scheduled_time time not null,
  status text not null check (status in ('scheduled', 'live', 'completed', 'postponed')),
  week integer not null,
  home_score integer,
  away_score integer,
  stream_url text,
  vod_url text
);

create table if not exists standings (
  org_id text primary key references orgs(id) on delete cascade,
  division_id text not null references divisions(id),
  wins integer not null default 0,
  losses integer not null default 0,
  matches_played integer not null default 0,
  points_for integer not null default 0,
  points_against integer not null default 0,
  streak jsonb not null default '[]'::jsonb,
  games_back numeric not null default 0
);

create table if not exists announcements (
  id text primary key,
  title text not null,
  body text not null,
  created_at timestamptz not null,
  category text not null check (category in ('general', 'rules', 'draft', 'results', 'admin')),
  pinned boolean not null default false
);

create index if not exists matches_schedule_idx on matches (scheduled_date, scheduled_time);
create index if not exists players_org_idx on players (org_id);
create index if not exists orgs_division_idx on orgs (division_id);

create table if not exists gods (
  id text primary key,
  name text not null,
  class text,
  damage_type text check (damage_type in ('physical', 'magical'))
);

insert into gods (id, name, class, damage_type) values
  ('achilles', 'Achilles', 'Warrior', 'physical'),
  ('anhur', 'Anhur', 'Hunter', 'physical'),
  ('athena', 'Athena', 'Guardian', 'magical'),
  ('baron-samedi', 'Baron Samedi', 'Mage', 'magical'),
  ('bellona', 'Bellona', 'Warrior', 'physical'),
  ('cerberus', 'Cerberus', 'Guardian', 'magical'),
  ('danzaburou', 'Danzaburou', 'Hunter', 'physical'),
  ('fenrir', 'Fenrir', 'Assassin', 'physical'),
  ('isis', 'Isis', 'Mage', 'magical'),
  ('merlin', 'Merlin', 'Mage', 'magical'),
  ('nemesis', 'Nemesis', 'Assassin', 'physical'),
  ('ymir', 'Ymir', 'Guardian', 'magical')
on conflict (id) do nothing;

create table if not exists god_draft_sessions (
  id text primary key,
  match_id text not null references matches(id) on delete cascade,
  game_number integer not null default 1,
  status text not null default 'pending' check (status in ('pending', 'lobby', 'banning', 'picking', 'complete')),
  home_ready boolean not null default false,
  away_ready boolean not null default false,
  current_phase_index integer not null default 0,
  current_step_index integer not null default 0,
  current_type text check (current_type in ('ban', 'pick')),
  current_side text check (current_side in ('A', 'B')),
  turn_started_at timestamptz,
  draft_state jsonb not null default '{"picks":[],"bans":[]}'::jsonb,
  reset_requested_by text check (reset_requested_by in ('A', 'B')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists god_picks (
  id bigint generated always as identity primary key,
  session_id text not null references god_draft_sessions(id) on delete cascade,
  match_id text not null references matches(id) on delete cascade,
  game_number integer not null,
  org_id text not null references orgs(id) on delete cascade,
  god_id text not null references gods(id),
  god_name text not null,
  slot integer not null,
  created_at timestamptz not null default now()
);

create table if not exists god_bans (
  id bigint generated always as identity primary key,
  session_id text not null references god_draft_sessions(id) on delete cascade,
  match_id text not null references matches(id) on delete cascade,
  game_number integer not null,
  org_id text not null references orgs(id) on delete cascade,
  god_id text not null references gods(id),
  god_name text not null,
  slot integer not null,
  created_at timestamptz not null default now()
);

create table if not exists draft_chat_messages (
  id bigint generated always as identity primary key,
  session_id text not null references god_draft_sessions(id) on delete cascade,
  channel text not null check (channel in ('team', 'spectator')),
  sender_name text not null,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists god_draft_sessions_match_idx on god_draft_sessions (match_id, game_number);
create index if not exists god_picks_vault_idx on god_picks (match_id, game_number, god_id);
create index if not exists god_bans_session_idx on god_bans (session_id);
create index if not exists draft_chat_messages_session_idx on draft_chat_messages (session_id, created_at);

create or replace function complete_god_draft(
  p_session_id text,
  p_match_id text,
  p_game_number integer,
  p_draft_state jsonb,
  p_bans jsonb,
  p_picks jsonb
) returns void
language plpgsql
as $$
begin
  delete from god_bans where session_id = p_session_id;
  delete from god_picks where session_id = p_session_id;

  insert into god_bans (session_id, match_id, game_number, org_id, god_id, god_name, slot)
  select p_session_id, p_match_id, p_game_number, item.org_id, item.god_id, item.god_name, item.slot
  from jsonb_to_recordset(p_bans) as item(org_id text, god_id text, god_name text, slot integer);

  insert into god_picks (session_id, match_id, game_number, org_id, god_id, god_name, slot)
  select p_session_id, p_match_id, p_game_number, item.org_id, item.god_id, item.god_name, item.slot
  from jsonb_to_recordset(p_picks) as item(org_id text, god_id text, god_name text, slot integer);

  update god_draft_sessions
    set status = 'complete',
        current_type = null,
        current_side = null,
        turn_started_at = null,
        draft_state = p_draft_state,
        completed_at = now(),
        updated_at = now()
    where id = p_session_id;
end;
$$;

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

do $$
begin
  alter publication supabase_realtime add table god_draft_sessions;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table draft_chat_messages;
exception
  when duplicate_object then null;
end $$;

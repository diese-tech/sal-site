-- Draft rooms: one per division per season
create table if not exists draft_rooms (
  id text primary key,
  season_id text not null references seasons(id),
  division_id text not null references divisions(id),
  status text not null default 'pending' check (status in ('pending', 'active', 'paused', 'complete')),
  rounds integer not null default 5,
  pick_timer_seconds integer not null default 120,
  -- Base pick order: array of org_id strings (round 1 order); snake is derived
  base_order jsonb not null default '[]'::jsonb,
  current_pick_index integer not null default 0,
  pick_started_at timestamptz,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  unique (season_id, division_id)
);

-- Individual picks within a draft
create table if not exists draft_picks (
  id bigserial primary key,
  draft_room_id text not null references draft_rooms(id) on delete cascade,
  pick_number integer not null,
  org_id text not null references orgs(id),
  player_id text not null references players(id),
  picked_at timestamptz not null default now(),
  unique (draft_room_id, pick_number),
  unique (draft_room_id, player_id)
);

-- Per-org captain tokens for a draft (admin generates, shares with captains)
create table if not exists captain_tokens (
  id text primary key,  -- random URL-safe token (shown to captain once)
  draft_room_id text not null references draft_rooms(id) on delete cascade,
  org_id text not null references orgs(id),
  token_hash text not null,  -- SHA-256 hex of id
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (draft_room_id, org_id)
);

create index if not exists draft_picks_room_idx on draft_picks (draft_room_id, pick_number);
create index if not exists captain_tokens_hash_idx on captain_tokens (token_hash);

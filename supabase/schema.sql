create table if not exists seasons (
  id text primary key,
  name text not null,
  status text not null check (status in ('pre-season', 'active', 'post-season', 'offseason')),
  start_date date not null,
  end_date date not null,
  current_week integer not null default 1
);

create table if not exists divisions (
  id text primary key check (id in ('solar', 'lunar', 'gaia')),
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

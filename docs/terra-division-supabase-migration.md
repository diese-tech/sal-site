# Terra Division Supabase Migration

Goal: rename the live division identifier from `gaia` to `terra` so production Supabase data matches the app code and SALBot roster sync.

Code has already been updated to use:

- `DivisionId = "solar" | "lunar" | "terra"`
- `Terra Division` as the user-facing label
- `TER` as the ticker tag
- `supabase/migrations/018_seed_divisions.sql` seeds `terra`, not `gaia`

Run this in the Supabase project for `sal-site`.

## 1. Read-only preflight

Confirm current division rows:

```sql
select id, name, description, tier, accent_color
from divisions
order by tier;
```

Discover tables with foreign keys to `divisions(id)`:

```sql
select
  tc.table_schema,
  tc.table_name,
  kcu.column_name,
  rc.update_rule,
  rc.delete_rule
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on tc.constraint_name = kcu.constraint_name
 and tc.table_schema = kcu.table_schema
join information_schema.referential_constraints rc
  on tc.constraint_name = rc.constraint_name
 and tc.constraint_schema = rc.constraint_schema
where tc.constraint_type = 'FOREIGN KEY'
  and kcu.ordinal_position is not null
  and rc.unique_constraint_name in (
    select constraint_name
    from information_schema.table_constraints
    where table_name = 'divisions'
      and constraint_type in ('PRIMARY KEY', 'UNIQUE')
  )
order by tc.table_schema, tc.table_name, kcu.column_name;
```

Check known current references:

```sql
select 'divisions' as table_name, count(*) as gaia_rows from divisions where id = 'gaia'
union all select 'orgs', count(*) from orgs where division_id = 'gaia'
union all select 'players', count(*) from players where division_id = 'gaia'
union all select 'matches', count(*) from matches where division_id = 'gaia'
union all select 'standings', count(*) from standings where division_id = 'gaia'
union all select 'draft_rooms', count(*) from draft_rooms where division_id = 'gaia';
```

If the FK discovery query finds additional tables with `division_id`, include them in the update transaction below.

## 2. Migration transaction

Use this insert-update-delete pattern rather than updating the primary key directly, because the live FK constraints may not be `ON UPDATE CASCADE`.

```sql
begin;

insert into divisions (id, name, description, tier, accent_color)
select
  'terra',
  'Terra Division',
  description,
  tier,
  accent_color
from divisions
where id = 'gaia'
on conflict (id) do update
set
  name = excluded.name,
  description = excluded.description,
  tier = excluded.tier,
  accent_color = excluded.accent_color;

update orgs set division_id = 'terra' where division_id = 'gaia';
update players set division_id = 'terra' where division_id = 'gaia';
update matches set division_id = 'terra' where division_id = 'gaia';
update standings set division_id = 'terra' where division_id = 'gaia';
update draft_rooms set division_id = 'terra' where division_id = 'gaia';

delete from divisions where id = 'gaia';

commit;
```

If any referenced table does not exist in the target database, remove that single `update` line and rerun inside a fresh transaction. Do not ignore FK errors; they mean another table still references `gaia`.

## 3. Post-migration verification

```sql
select id, name, description, tier, accent_color
from divisions
order by tier;
```

```sql
select 'divisions' as table_name, count(*) as gaia_rows from divisions where id = 'gaia'
union all select 'orgs', count(*) from orgs where division_id = 'gaia'
union all select 'players', count(*) from players where division_id = 'gaia'
union all select 'matches', count(*) from matches where division_id = 'gaia'
union all select 'standings', count(*) from standings where division_id = 'gaia'
union all select 'draft_rooms', count(*) from draft_rooms where division_id = 'gaia';
```

Expected result: every `gaia_rows` value is `0`, and `divisions` contains `terra`.

Optional sanity check:

```sql
select 'orgs' as table_name, count(*) as terra_rows from orgs where division_id = 'terra'
union all select 'players', count(*) from players where division_id = 'terra'
union all select 'matches', count(*) from matches where division_id = 'terra'
union all select 'standings', count(*) from standings where division_id = 'terra'
union all select 'draft_rooms', count(*) from draft_rooms where division_id = 'terra';
```

## 4. App follow-up

After the database migration lands:

1. Deploy the branch containing the Terra code rename.
2. Verify `/standings`, `/teams`, `/players`, `/schedule`, `/gods`, admin import, admin match report, and draft flows no longer refer to Gaia.
3. Use the Terra roster CSV with SALBot: `division,discord_username` where division is `terra`.

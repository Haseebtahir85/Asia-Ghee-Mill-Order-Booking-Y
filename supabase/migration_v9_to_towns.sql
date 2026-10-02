-- ============================================================
-- migration_v9_to_towns.sql
-- Run ONCE in the Supabase SQL editor (after v7 and v8).
--
-- A TO can now have MANY towns, and a town can belong to only ONE TO.
--   tos       -> one row per TO (unique name)
--   to_towns  -> which towns each TO has; town_id is UNIQUE, so a
--                town can never be used twice
--
-- Existing data is converted automatically:
--   - rows with the same TO name are merged into one TO (earliest kept)
--   - if the same town was on two TO's, the earliest TO keeps it
--   - filed reports are re-pointed to the kept TO
--   - a TO that was on "All towns" is kept with no towns — open
--     TO's Names in the admin and give it its towns
-- ============================================================

create table if not exists to_towns (
  to_id uuid not null references tos(id) on delete cascade,
  town_id uuid not null references towns(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (to_id, town_id),
  constraint to_towns_town_unique unique (town_id)
);

create index if not exists to_towns_to_idx on to_towns (to_id);

alter table to_towns enable row level security;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tos' and column_name = 'town_id'
  ) then
    drop table if exists _tos_canon;
    create temp table _tos_canon as
      select id,
             first_value(id) over (partition by lower(name) order by sort_order, created_at, id) as canon_id
      from tos;

    -- each town goes to the earliest TO that had it
    insert into to_towns (to_id, town_id)
    select distinct on (t.town_id) c.canon_id, t.town_id
    from tos t
    join _tos_canon c on c.id = t.id
    where t.town_id is not null
    order by t.town_id, t.sort_order, t.created_at, t.id
    on conflict do nothing;

    -- keep filed reports pointing at the surviving TO
    update secondary_reports r
       set to_id = c.canon_id
      from _tos_canon c
     where r.to_id = c.id and c.id <> c.canon_id;

    delete from tos where id in (select id from _tos_canon where id <> canon_id);

    drop index if exists tos_name_town_uniq;
    alter table tos drop column town_id;
    drop table if exists _tos_canon;
  end if;
end $$;

create unique index if not exists tos_name_uniq on tos (lower(name));

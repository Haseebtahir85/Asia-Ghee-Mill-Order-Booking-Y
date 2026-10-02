-- ============================================================
-- migration_v8_tos_settings.sql
-- Run ONCE in the Supabase SQL editor (after migration_v7).
--
-- 1) TO's are no longer locked to one town:
--      - a TO may have NO town (works for every town), or any town
--      - the same TO name can be added to many towns
--      - a town can have more than one TO
--    The only rule left: the same TO name can't be added twice
--    to the same town (or twice as "all towns").
-- 2) The report page's ON/OFF + month now live in their own
--    one-row table (instead of the shared `settings` table).
-- ============================================================

-- ---- 1) tos ------------------------------------------------
alter table tos drop constraint if exists tos_town_id_unique;
alter table tos alter column town_id drop not null;

create unique index if not exists tos_name_town_uniq
  on tos (lower(name), coalesce(town_id, '00000000-0000-0000-0000-000000000000'::uuid));

create index if not exists tos_town_idx on tos (town_id);

-- ---- 2) report page settings (single row, id = 1) -----------
create table if not exists secondary_report_settings (
  id integer primary key default 1 check (id = 1),
  enabled boolean not null default true,
  selected_month integer check (selected_month between 1 and 12),
  updated_at timestamptz not null default now()
);

insert into secondary_report_settings (id) values (1)
on conflict (id) do nothing;

alter table secondary_report_settings enable row level security;

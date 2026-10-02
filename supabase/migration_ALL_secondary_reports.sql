-- ============================================================
-- migration_ALL_secondary_reports.sql
-- ONE file for everything the TO's Secondary Ach. Report needs.
-- Safe to run from ANY state — whether you ran v7 / v8 / v9 before,
-- none of them, or some of them — and safe to run again.
-- Paste it all into the Supabase SQL editor and press Run.
--
-- Final result:
--   tos                        one row per TO (unique name)
--   to_towns                   a TO has many towns; a town can belong to
--                              only ONE TO (town_id is unique)
--   secondary_reports          one filed report per town per month
--   secondary_report_lines     the 3 pages' items for each report
--   secondary_report_settings  page ON/OFF + selected month (one row)
-- ============================================================

-- ---- helper used by the updated_at triggers (only if you don't have it) ----
do $$
begin
  if not exists (select 1 from pg_proc where proname = 'set_updated_at') then
    create function set_updated_at() returns trigger language plpgsql as $f$
    begin
      new.updated_at = now();
      return new;
    end
    $f$;
  end if;
end $$;

-- ---- TO's ----
create table if not exists tos (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_tos_updated_at on tos;
create trigger trg_tos_updated_at
  before update on tos
  for each row execute function set_updated_at();

-- ---- which towns belong to which TO (a town can only be used once) ----
create table if not exists to_towns (
  to_id uuid not null references tos(id) on delete cascade,
  town_id uuid not null references towns(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (to_id, town_id),
  constraint to_towns_town_unique unique (town_id)
);

create index if not exists to_towns_to_idx on to_towns (to_id);

-- ---- convert older data (one TO row per town) into the new shape ----
-- Only runs if tos still has the old town_id column:
--   - rows with the same TO name are merged into one TO (earliest kept)
--   - if the same town was on two TO's, the earliest TO keeps it
--   - a TO that was on "All towns" is kept with no towns (give it towns in admin)
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

    insert into to_towns (to_id, town_id)
    select distinct on (t.town_id) c.canon_id, t.town_id
    from tos t
    join _tos_canon c on c.id = t.id
    where t.town_id is not null
    order by t.town_id, t.sort_order, t.created_at, t.id
    on conflict do nothing;

    -- keep already-filed reports pointing at the surviving TO
    if to_regclass('public.secondary_reports') is not null then
      update secondary_reports r
         set to_id = c.canon_id
        from _tos_canon c
       where r.to_id = c.id and c.id <> c.canon_id;
    end if;

    delete from tos where id in (select id from _tos_canon where id <> canon_id);

    drop index if exists tos_name_town_uniq;
    alter table tos drop column town_id;
    drop table if exists _tos_canon;
  end if;
end $$;

create unique index if not exists tos_name_uniq on tos (lower(name));

-- ---- filed reports ----
create table if not exists secondary_reports (
  id uuid primary key default gen_random_uuid(),
  report_month integer not null check (report_month between 1 and 12),
  report_year integer not null,
  town_id uuid references towns(id) on delete set null,
  town_name text not null,
  to_id uuid references tos(id) on delete set null,
  to_name text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists secondary_reports_town_period_uniq
  on secondary_reports (report_year, report_month, town_id)
  where town_id is not null;

create index if not exists secondary_reports_period_idx
  on secondary_reports (report_year, report_month);

create table if not exists secondary_report_lines (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references secondary_reports(id) on delete cascade,
  stage text not null check (stage in ('closing_opening', 'secondary_sale', 'closing_stock')),
  item_id uuid references items(id) on delete set null,
  item_name text not null,
  item_type text not null default 'other',
  item_sort integer not null default 0,
  weight_kg numeric not null default 0,
  qty numeric not null check (qty > 0),
  weight_total_kg numeric generated always as (qty * weight_kg) stored,
  created_at timestamptz not null default now()
);

create index if not exists secondary_report_lines_report_idx
  on secondary_report_lines (report_id);

-- ---- page ON/OFF + month (single row) ----
create table if not exists secondary_report_settings (
  id integer primary key default 1 check (id = 1),
  enabled boolean not null default true,
  selected_month integer check (selected_month between 1 and 12),
  updated_at timestamptz not null default now()
);

insert into secondary_report_settings (id) values (1)
on conflict (id) do nothing;

-- ---- only the server (service role) touches these tables ----
alter table tos enable row level security;
alter table to_towns enable row level security;
alter table secondary_reports enable row level security;
alter table secondary_report_lines enable row level security;
alter table secondary_report_settings enable row level security;

-- ---- stock sheet (monthly Excel uploaded by the admin) + per-report stock check ----
create table if not exists stock_sheets (
  id uuid primary key default gen_random_uuid(),
  report_month integer not null check (report_month between 1 and 12),
  report_year integer not null,
  file_name text,
  uploaded_at timestamptz not null default now(),
  constraint stock_sheets_period_unique unique (report_year, report_month)
);

create table if not exists stock_sheet_rows (
  id uuid primary key default gen_random_uuid(),
  sheet_id uuid not null references stock_sheets(id) on delete cascade,
  row_no integer not null,
  sheet_to_name text not null,
  sheet_towns text,
  to_id uuid references tos(id) on delete set null,
  opening_ghee numeric, opening_oil numeric, opening_rso numeric,
  primary_ghee numeric not null default 0,
  primary_oil numeric not null default 0,
  primary_rso numeric not null default 0,
  secondary_ghee numeric, secondary_oil numeric, secondary_rso numeric,
  closing_ghee numeric, closing_oil numeric, closing_rso numeric,
  remarks text
);

create index if not exists stock_sheet_rows_sheet_idx on stock_sheet_rows (sheet_id);
create index if not exists stock_sheet_rows_to_idx on stock_sheet_rows (to_id);

alter table secondary_reports add column if not exists check_status text;
alter table secondary_reports add column if not exists check_data jsonb;

alter table stock_sheets enable row level security;
alter table stock_sheet_rows enable row level security;

-- ---- make Supabase's API notice the new tables right away ----
notify pgrst, 'reload schema';

-- ---- result: this should list all 7 tables ----
select to_regclass('public.tos') as tos,
       to_regclass('public.to_towns') as to_towns,
       to_regclass('public.secondary_reports') as secondary_reports,
       to_regclass('public.secondary_report_lines') as secondary_report_lines,
       to_regclass('public.secondary_report_settings') as secondary_report_settings,
       to_regclass('public.stock_sheets') as stock_sheets,
       to_regclass('public.stock_sheet_rows') as stock_sheet_rows;

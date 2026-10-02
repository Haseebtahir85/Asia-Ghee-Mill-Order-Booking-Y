-- ============================================================
-- migration_v7_secondary_reports.sql
-- TO's Secondary Ach. Report: TO's Names (one TO per town),
-- filed reports, and their per-item lines.
-- Run once in the Supabase SQL editor.
--
-- Page settings (ON/OFF + selected month) live in the existing
-- `settings` table under the keys:
--   sr_enabled -> '1' | '0'
--   sr_month   -> '1'..'12'
-- (nothing to create for those — they're written from the admin
--  "Secondary Reports -> Settings" tab.)
-- ============================================================

-- ------------------------------------------------------------
-- TO's Names. A town belongs to AT MOST ONE TO (unique town_id).
-- Deleting a town removes its TO row.
-- ------------------------------------------------------------
create table if not exists tos (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  town_id uuid not null references towns(id) on delete cascade,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tos_town_id_unique unique (town_id)
);

drop trigger if exists trg_tos_updated_at on tos;
create trigger trg_tos_updated_at
  before update on tos
  for each row execute function set_updated_at();

-- ------------------------------------------------------------
-- Filed reports. report_month/report_year = the month the admin
-- selected (pages 2 and 3). Page 1 is always the month before it.
-- One report per town per period (unique index below) — that is
-- what blocks a second filing for the same town.
-- town_name / to_name are snapshots so history survives renames
-- and deletions.
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- Per-item lines for each of the 3 pages.
--   closing_opening -> page 1 (previous month closing / opening)
--   secondary_sale  -> page 2 (selected month)
--   closing_stock   -> page 3 (selected month)
-- weight_kg is the per-unit weight at filing time (snapshot).
-- ------------------------------------------------------------
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

-- Locked down like every other table: only the server (service role) touches them.
alter table tos enable row level security;
alter table secondary_reports enable row level security;
alter table secondary_report_lines enable row level security;

-- ============================================================
-- migration_v10_stock_check.sql
-- Run ONCE in the Supabase SQL editor (after migration_ALL_secondary_reports.sql).
-- Safe to run again.
--
-- Monthly "Town wise Closing Stock Report" Excel sheet uploaded by the admin:
--   stock_sheets      one uploaded file per month
--   stock_sheet_rows  one row per TO (primary achievement etc. from the file)
-- and the result of comparing a TO's report with the sheet is stored on the
-- filed report (check_status / check_data).
-- ============================================================

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

notify pgrst, 'reload schema';

select to_regclass('public.stock_sheets') as stock_sheets,
       to_regclass('public.stock_sheet_rows') as stock_sheet_rows,
       (select count(*) from information_schema.columns
         where table_name = 'secondary_reports' and column_name in ('check_status','check_data')) as report_columns_added;

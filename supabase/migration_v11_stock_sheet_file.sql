-- ============================================================
-- migration_v11_stock_sheet_file.sql
-- Run ONCE in the Supabase SQL editor (after migration_v10_stock_check.sql).
-- Safe to run again.
--
-- Keeps a copy of each uploaded stock sheet Excel file so the admin can
-- download it again exactly as it was uploaded.
-- ============================================================

alter table stock_sheets add column if not exists file_data text;  -- the file, base64
alter table stock_sheets add column if not exists file_mime text;  -- e.g. application/vnd.openxmlformats-officedocument.spreadsheetml.sheet

notify pgrst, 'reload schema';

select (select count(*) from information_schema.columns
         where table_name = 'stock_sheets' and column_name in ('file_data', 'file_mime')) as file_columns_added;

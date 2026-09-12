-- ============================================================
-- Migration: v5 -> v6 (Group No. + Code/UPC on towns)
-- Run this ONCE in the Supabase SQL editor of your project.
-- ============================================================

-- lib/types.ts already declares these on the Town type; this adds
-- the matching columns for databases that don't have them yet.
-- Existing rows get NULL for both until edited from /admin/towns.
alter table towns add column if not exists group_no integer;
alter table towns add column if not exists upc text;

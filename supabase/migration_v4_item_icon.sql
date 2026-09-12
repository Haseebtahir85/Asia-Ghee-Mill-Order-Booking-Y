-- ============================================================
-- Migration: v3 -> v4 (explicit icon per item)
-- Run this ONCE in the Supabase SQL editor of your project.
-- ============================================================

-- Existing rows get NULL, which just means the /book page keeps
-- guessing the icon from the item name (tin/pack/bucket/RSO/soap)
-- until you set one explicitly from /admin/items.
alter table items add column if not exists icon text;

alter table items drop constraint if exists items_icon_check;
alter table items add constraint items_icon_check
  check (icon is null or icon in ('tin', 'pack', 'bucket', 'bottle', 'soap'));

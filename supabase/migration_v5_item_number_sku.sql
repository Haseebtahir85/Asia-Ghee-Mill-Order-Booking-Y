-- ============================================================
-- Migration: v4 -> v5 (item number + SKU, admin-only)
-- Run this ONCE in the Supabase SQL editor of your project.
-- ============================================================

-- Both are plain reference text, never shown on the public /book
-- page (the public GET /api/items route doesn't select them) —
-- they're for internal admin bookkeeping only.
alter table items add column if not exists item_number text;
alter table items add column if not exists sku_number text;

-- ============================================================
-- Migration: v1 -> v2 (explicit per-item weight)
-- Run this ONCE in the Supabase SQL editor of your EXISTING
-- project (the one you already ran supabase/schema.sql on).
-- Do NOT also run schema.sql again — this migration upgrades
-- the same tables in place.
--
-- What changes:
--  - items gets a new `weight_kg` column (admin-edited, no
--    longer parsed from the name) — the whole catalog is
--    replaced with the current name/weight/rate list
--  - order_items.weight_kg is redefined as PER-UNIT weight
--    (it was accidentally storing the line total before, which
--    made every weight report double-count qty) and gets a new
--    generated `weight_total_kg` column for the line total
--  - orders gets a single `total_weight_kg` column, replacing
--    the old total_weight_ghee_kg / total_weight_oil_kg split
--
-- Safe to run even with existing orders: deleting the old items
-- does NOT delete past order_items (item_id just becomes null on
-- those rows; their name/rate snapshot is untouched). Past
-- orders' total_weight_ghee_kg/oil_kg values are dropped along
-- with those columns, so if you need to keep that historical
-- split, export it first.
-- ============================================================

-- ---- items: add weight_kg, replace the catalog ----
alter table items add column if not exists weight_kg numeric not null default 0 check (weight_kg >= 0);

delete from items;

insert into items (name, weight_kg, rate, type, sort_order) values
  ('16 Kg tin',        16,    8630, 'ghee', 10),
  ('16 Kg tin (B)',    16,    8530, 'ghee', 20),
  ('10 Kg tin',        10,    5394, 'ghee', 30),
  ('5 Kg tin',         5,     2697, 'ghee', 40),
  ('1 Kg 12 Pack',     12,    6353, 'ghee', 50),
  ('1/2 Kg 24 Pack',   12,    6353, 'ghee', 60),
  ('1/4 Kg 48 Pack',   12,    6353, 'ghee', 70),
  ('1 Kg 10 Pack',     10,    5294, 'ghee', 80),
  ('1/2 Kg 20 Pack',   10,    5294, 'ghee', 90),
  ('1/4 Kg 40 Pack',   10,    5294, 'ghee', 100),
  ('1 Kg 5 Pack',      5,     2647, 'ghee', 110),
  ('16 Kg Bucket',     16,    8630, 'ghee', 120),
  ('10 Kg Bucket',     10,    5394, 'ghee', 130),
  ('5 Kg Bucket',      5,     2697, 'ghee', 140),
  ('2.5 Kg Bucket',    2.5,   1348, 'ghee', 150),
  ('16 Ltr.s. tin',    14.56, 8730, 'oil', 160),
  ('10 Ltr.s. Tin',    9.1,   5456, 'oil', 170),
  ('5 Ltr.s. Tin',     4.55,  2728, 'oil', 180),
  ('1 Ltr. 12 Pack',   10.92, 6428, 'oil', 190),
  ('1 Ltr. 10 Pack',   9.1,   5356, 'oil', 200),
  ('1 Ltr. 5 Pack',    4.55,  2678, 'oil', 210),
  ('1 Ltr.6 Pack B',   5.46,  3328, 'oil', 220),
  ('3 Ltr.4 Pack B',   10.92, 6668, 'oil', 230),
  ('1 Ltr.5 Pack C',   4.55,  2678, 'oil', 240),
  ('1 Ltr.6 Pack C',   5.46,  3328, 'oil', 250),
  ('3 Ltr.4 Pack C',   10.92, 6668, 'oil', 260),
  ('RSO 250 ml',       5.46,  3100, 'oil', 270),
  ('RSO 500 ml',       5.46,  3100, 'oil', 280),
  ('RSO 1000 ml',      5.46,  3100, 'oil', 290),
  ('Soap Carton',      10,    2700, 'other', 300);

-- ---- order_items: fix weight semantics, add line-total column ----
-- (weight_kg already exists from v1 — redefining its meaning only,
-- no column change needed. New orders will populate it correctly
-- as PER-UNIT weight going forward.)
alter table order_items add column if not exists weight_total_kg numeric
  generated always as (round((qty * weight_kg)::numeric, 3)) stored;

-- ---- orders: single combined weight column ----
alter table orders add column if not exists total_weight_kg numeric not null default 0;
alter table orders drop column if exists total_weight_ghee_kg;
alter table orders drop column if exists total_weight_oil_kg;

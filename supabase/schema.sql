-- ============================================================
-- Ghee/Oil Order Booking System — Supabase schema (v2)
-- Run this in the Supabase SQL editor (or via CLI migration)
--
-- v2 change: item weight is now an explicit, admin-edited field
-- (items.weight_kg) instead of being parsed from the item name.
-- If you already ran the v1 schema, use
-- supabase/migration_v2_explicit_weights.sql instead of this file.
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- Settings — small key/value store for tunables. Currently
-- unused by the booking flow (weight is no longer parsed/
-- computed from a density), kept in case you need config values
-- later.
-- ------------------------------------------------------------
create table if not exists settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Items catalog — the product list shown on the order booking
-- page. Rate is per unit sold (per tin/pack/bucket/carton, not
-- per kg). Weight is also per unit sold, entered directly by the
-- admin — not derived from the name.
-- ------------------------------------------------------------
create table if not exists items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  weight_kg numeric not null default 0 check (weight_kg >= 0),
  rate numeric not null default 0 check (rate >= 0),
  type text not null check (type in ('ghee', 'oil', 'other')),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_items_sort on items (sort_order);
create index if not exists idx_items_active on items (is_active);

-- ------------------------------------------------------------
-- Towns — admin-managed dropdown list shown on the booking page.
-- ------------------------------------------------------------
create table if not exists towns (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_towns_sort on towns (sort_order);
create index if not exists idx_towns_active on towns (is_active);

-- ------------------------------------------------------------
-- Orders — one row per submitted booking (from the public /book
-- link). Totals are computed application-side at submit time and
-- stored so historical orders don't shift if rates/items change
-- later.
-- ------------------------------------------------------------
create sequence if not exists order_number_seq start 1;

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique
    default ('ORD-' || lpad(nextval('order_number_seq')::text, 5, '0')),
  customer_name text not null,
  town_id uuid references towns (id) on delete set null,
  town text,
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'dispatched', 'delivered', 'cancelled')),
  order_date date not null default current_date,
  notes text,
  total_amount numeric not null default 0,
  total_weight_kg numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_orders_status on orders (status);
create index if not exists idx_orders_date on orders (order_date);

-- ------------------------------------------------------------
-- Order line items — a snapshot of each item at order time
-- (name/rate/weight/type), so the order stays accurate even if
-- the admin later edits or removes the catalog item.
--
-- `rate` and `weight_kg` here are PER UNIT (same convention as
-- the items table) — `amount` and `weight_total_kg` are the
-- computed line totals (qty × rate, qty × weight_kg).
-- ------------------------------------------------------------
create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  item_id uuid references items (id) on delete set null,
  item_name text not null,
  item_type text not null check (item_type in ('ghee', 'oil', 'other')),
  rate numeric not null check (rate >= 0),
  weight_kg numeric not null default 0 check (weight_kg >= 0),
  qty numeric not null check (qty >= 0),
  amount numeric generated always as (round((qty * rate)::numeric, 2)) stored,
  weight_total_kg numeric generated always as (round((qty * weight_kg)::numeric, 3)) stored,
  created_at timestamptz not null default now()
);

create index if not exists idx_order_items_order on order_items (order_id);

-- ------------------------------------------------------------
-- keep updated_at fresh
-- ------------------------------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_items_updated_at on items;
create trigger trg_items_updated_at
  before update on items
  for each row execute function set_updated_at();

drop trigger if exists trg_orders_updated_at on orders;
create trigger trg_orders_updated_at
  before update on orders
  for each row execute function set_updated_at();

drop trigger if exists trg_towns_updated_at on towns;
create trigger trg_towns_updated_at
  before update on towns
  for each row execute function set_updated_at();

-- ------------------------------------------------------------
-- RLS — locked down by default. The app talks to Supabase only
-- from server-side API routes using the service role key, which
-- bypasses RLS.
-- ------------------------------------------------------------
alter table items enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table settings enable row level security;
alter table towns enable row level security;

-- ------------------------------------------------------------
-- Seed data — the current item catalog (name, weight per unit
-- in kg, rate per unit). Adjust any time from /admin/items.
-- ------------------------------------------------------------
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
  ('Soap Carton',      10,    2700, 'other', 300)
on conflict do nothing;

-- ------------------------------------------------------------
-- Seed towns — edit any time from /admin/towns
-- ------------------------------------------------------------
insert into towns (name, sort_order) values
  ('Bahawalpur', 10),
  ('Multan', 20),
  ('Lahore', 30),
  ('Karachi', 40),
  ('Rahim Yar Khan', 50)
on conflict (name) do nothing;

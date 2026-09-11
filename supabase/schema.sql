-- ============================================================
-- Ghee/Oil Order Booking System — Supabase schema
-- Run this in the Supabase SQL editor (or via CLI migration)
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- Settings — small key/value store for tunables (currently just
-- the oil density used to convert Ltr/ml item volumes to kg for
-- the Weight-Oil ton total). Add more rows as needed.
-- ------------------------------------------------------------
create table if not exists settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

insert into settings (key, value)
values ('oil_density_kg_per_liter', '0.91')
on conflict (key) do nothing;

-- ------------------------------------------------------------
-- Items catalog — the product list shown on the order booking
-- page. Rate is per unit sold (per tin/pack/bucket/carton, not
-- per kg). Weight-per-unit is NOT stored here — it's parsed from
-- `name` at read time (see lib/weightParser.ts) so renaming an
-- item's pack size automatically updates its weight contribution.
-- ------------------------------------------------------------
create table if not exists items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
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
-- Orders — one row per submitted booking (from the public /book
-- link). Totals are computed application-side at submit time and
-- stored so historical orders don't shift if rates/items change
-- later or the weight parser is tweaked.
-- ------------------------------------------------------------
create sequence if not exists order_number_seq start 1;

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique
    default ('ORD-' || lpad(nextval('order_number_seq')::text, 5, '0')),
  customer_name text not null,
  customer_contact text,
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'dispatched', 'delivered', 'cancelled')),
  order_date date not null default current_date,
  notes text,
  total_amount numeric not null default 0,
  total_weight_ghee_kg numeric not null default 0,
  total_weight_oil_kg numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_orders_status on orders (status);
create index if not exists idx_orders_date on orders (order_date);

-- ------------------------------------------------------------
-- Order line items — a snapshot of each item at order time
-- (name/rate/type), so the order stays accurate even if the
-- admin later edits or removes the catalog item.
-- ------------------------------------------------------------
create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  item_id uuid references items (id) on delete set null,
  item_name text not null,
  item_type text not null check (item_type in ('ghee', 'oil', 'other')),
  rate numeric not null check (rate >= 0),
  qty numeric not null check (qty >= 0),
  amount numeric generated always as (round((qty * rate)::numeric, 2)) stored,
  weight_kg numeric not null default 0,
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

-- ------------------------------------------------------------
-- RLS — locked down by default. The app talks to Supabase only
-- from server-side API routes using the service role key, which
-- bypasses RLS. Add explicit policies if you ever query from the
-- browser directly.
-- ------------------------------------------------------------
alter table items enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table settings enable row level security;

-- ------------------------------------------------------------
-- Seed data — the item catalog from the reference rate sheet.
-- Adjust rates any time from /admin/items; this just gets you
-- started with the same rows and sort order shown in the sheet.
-- ------------------------------------------------------------
insert into items (name, rate, type, sort_order) values
  ('16 Kg tin', 8580, 'ghee', 10),
  ('16 Kg tin (B)', 8180, 'ghee', 20),
  ('10 Kg tin', 5363, 'ghee', 30),
  ('5 Kg tin', 2681, 'ghee', 40),
  ('1 Kg 12 Pack', 6315, 'ghee', 50),
  ('1/2 Kg 24 Pack', 6315, 'ghee', 60),
  ('1/4 Kg 48 Pack', 6315, 'ghee', 70),
  ('1 Kg 10 Pack', 5263, 'ghee', 80),
  ('1/2 Kg 20 Pack', 5263, 'ghee', 90),
  ('1/4 Kg 40 Pack', 5263, 'ghee', 100),
  ('1 Kg 5 Pack', 2631, 'ghee', 110),
  ('16 Kg Bucket', 8580, 'ghee', 120),
  ('10 Kg Bucket', 5363, 'ghee', 130),
  ('5 Kg Bucket', 2681, 'ghee', 140),
  ('2.5 Kg Bucket', 1341, 'ghee', 150),
  ('16 Ltr.s. tin', 8680, 'oil', 160),
  ('10 Ltr.s. tin', 5425, 'oil', 170),
  ('5 Ltr.s. Tin', 2713, 'oil', 180),
  ('1 Ltr. 12 Pack', 6390, 'oil', 190),
  ('1 Ltr. 10 Pack', 5325, 'oil', 200),
  ('1 Ltr. 5 Pack', 2663, 'oil', 210),
  ('1 Ltr.6 Pack B', 3309, 'oil', 220),
  ('3 Ltr.4 Pack B', 6630, 'oil', 230),
  ('1 Ltr.5 Pack C', 2663, 'oil', 240),
  ('3 Ltr.4 Pack C', 6630, 'oil', 250),
  ('RSO 250 ml', 3100, 'oil', 260),
  ('RSO 500 ml', 3100, 'oil', 270),
  ('RSO 1000 ml', 3100, 'oil', 280),
  ('Soap Carton', 2700, 'other', 290)
on conflict do nothing;

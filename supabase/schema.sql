-- ============================================================
-- Order Booking System — Supabase schema
-- Run this in the Supabase SQL editor (or via CLI migration)
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- Rate cards: rate per kg for a given origin/destination and
-- optional weight slab. Used to auto-fill the rate when booking
-- an order; the rate can still be overridden manually per order.
-- ------------------------------------------------------------
create table if not exists rate_cards (
  id uuid primary key default gen_random_uuid(),
  origin text not null,
  destination text not null,
  min_weight_kg numeric not null default 0,
  max_weight_kg numeric,                     -- null = no upper bound
  rate_per_kg numeric not null,
  effective_from date not null default current_date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_rate_cards_route
  on rate_cards (origin, destination, is_active);

-- ------------------------------------------------------------
-- Orders
-- ------------------------------------------------------------
create sequence if not exists order_number_seq start 1;

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique
    default ('ORD-' || lpad(nextval('order_number_seq')::text, 5, '0')),
  customer_name text not null,
  customer_contact text,
  origin text not null,
  destination text not null,
  weight_kg numeric not null check (weight_kg > 0),
  rate_per_kg numeric not null check (rate_per_kg >= 0),
  extra_charges numeric not null default 0,
  total_amount numeric generated always as
    (round((weight_kg * rate_per_kg + extra_charges)::numeric, 2)) stored,
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'dispatched', 'delivered', 'cancelled')),
  order_date date not null default current_date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_orders_status on orders (status);
create index if not exists idx_orders_date on orders (order_date);
create index if not exists idx_orders_customer on orders (customer_name);

-- keep updated_at fresh
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_orders_updated_at on orders;
create trigger trg_orders_updated_at
  before update on orders
  for each row execute function set_updated_at();

drop trigger if exists trg_rate_cards_updated_at on rate_cards;
create trigger trg_rate_cards_updated_at
  before update on rate_cards
  for each row execute function set_updated_at();

-- ------------------------------------------------------------
-- RLS — locked down by default. Since this app authenticates via
-- Supabase's service role from Next.js API routes (server-side
-- only), enable RLS and rely on the service key bypassing it.
-- If you later add client-side reads, add explicit policies.
-- ------------------------------------------------------------
alter table orders enable row level security;
alter table rate_cards enable row level security;

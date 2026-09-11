-- ============================================================
-- Migration: v2 -> v3 (Town replaces Contact)
-- Run this ONCE in the Supabase SQL editor of your project.
-- ============================================================

-- ---- towns: admin-managed dropdown list ----
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

drop trigger if exists trg_towns_updated_at on towns;
create trigger trg_towns_updated_at
  before update on towns
  for each row execute function set_updated_at();

alter table towns enable row level security;

-- seed a starting list — edit any time from /admin/towns
insert into towns (name, sort_order) values
  ('Bahawalpur', 10),
  ('Multan', 20),
  ('Lahore', 30),
  ('Karachi', 40),
  ('Rahim Yar Khan', 50)
on conflict (name) do nothing;

-- ---- orders: replace customer_contact with town ----
-- town_id is a live reference (nullable — if a town is later
-- deleted from the admin, old orders just lose the link, not the
-- name); `town` is the name snapshot at order time, same pattern
-- as item_name on order_items.
alter table orders add column if not exists town_id uuid references towns (id) on delete set null;
alter table orders add column if not exists town text;
alter table orders drop column if exists customer_contact;

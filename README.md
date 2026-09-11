# Order Booking System (Ghee/Oil)

Two separate pieces, as requested:

1. **`/book`** — a public, no-login order booking page. Share this URL with customers/staff who need to place orders. It shows the item table (Item / Qty / Rate / Amount / Type), computes Amount and the Weight-Ghee / Weight-Oil ton totals live as quantities are typed, and submits the order.
2. **`/admin`** — a separate, password-protected area where rates, items, and all settings live. Nothing on the `/book` page can change a rate or the item list — that only happens here.

## How the weight (Ghee/Oil tons) is calculated

Per-unit weight is **parsed directly from the item name** — nothing is stored separately, so renaming an item's pack size in the admin automatically updates its weight everywhere:

- `"16 Kg tin"`, `"16 Kg Bucket"`, `"2.5 Kg Bucket"` → weight = the Kg number itself
- `"1 Kg 12 Pack"`, `"1/2 Kg 24 Pack"` → weight = Kg-per-unit × pack count (both come out to 12kg here)
- `"16 Ltr.s. tin"`, `"1 Ltr. 12 Pack"`, `"1 Ltr.6 Pack B"` → volume in liters × oil density → kg
- `"RSO 250 ml"` → 0.25L × oil density → kg
- Anything that doesn't match one of these patterns (e.g. `"Soap Carton"`) → 0 weight, still counted in Amount

The oil density (default **0.91 kg/L**) lives in the `settings` table and is editable at `PATCH /api/admin/settings`. I validated the parser against your rate sheet — it reproduces **Weight-Ghee 9.24 ton** and **Weight-Oil 0.77 ton** exactly from the same quantities.

The parser is in `lib/weightParser.ts` and is used both by the `/book` page (live preview) and the order-creation API route (final stored totals) — so what the customer sees matches what gets saved.

Amount = Qty × Rate (rate is per unit sold — per tin/pack/bucket — not per kg), also confirmed with you.

## Admin protection

`/admin/*` and `/api/admin/*` are gated by `middleware.ts` behind a single shared password (`ADMIN_PASSWORD`) and a signed session cookie (`ADMIN_SESSION_SECRET`, 12-hour expiry). This is intentionally simple — good enough to keep the rate sheet from being wide open, but if multiple staff need distinct logins later, swap this for Supabase Auth.

The `/book` page and its two read endpoint (`/api/items`, `/api/settings`) are intentionally public with no auth, since it's meant to be "just a link."

## Setup

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the Supabase SQL editor. It creates `items`, `orders`, `order_items`, and `settings`, and seeds the item catalog from your rate sheet (edit rates any time from `/admin/items` — the seed is just a starting point).
3. Copy `.env.example` to `.env.local` and fill in all four values.
4. Install and run:
   ```bash
   npm install
   npm run dev
   ```
5. `http://localhost:3000` redirects to `/book` (the shareable link). `/admin/login` gets you into the admin area.

## API routes

Public:
- `GET /api/items` — active catalog for the booking page
- `GET /api/settings` — oil density (used for the live weight preview)
- `POST /api/orders` — submit an order (`{ customer_name, customer_contact?, notes?, lines: [{item_id, qty}] }`). Rates, types, and weights are always recomputed server-side from the current catalog — a tampered request can't book at a fake price.

Admin (all behind the password):
- `GET/POST /api/admin/items`, `PATCH/DELETE /api/admin/items/[id]`, `POST /api/admin/items/reorder`
- `GET/PATCH /api/admin/settings`
- `GET /api/admin/orders`, `GET/PATCH /api/admin/orders/[id]`
- `POST /api/admin/orders/export` — `.xlsx` with three sheets: **Orders** (one row per order), **Item Totals** (aggregated Item/Qty/Rate/Amount/Type across the selected orders, in the same shape as your rate sheet, with the Weight-Ghee/Weight-Oil/Total Amount footer), and **Line Items** (every line of every selected order)

## Things you may want to adjust

- The seeded rates are read off your screenshot — double check them in `/admin/items` before going live, OCR/manual transcription can be off by a digit here and there.
- If an item name doesn't fit the parser's patterns, it silently gets 0 weight (still counted in Amount). If you add unusual pack names, either match the existing naming conventions or extend `lib/weightParser.ts`.
- No customer-facing order history/tracking yet — the confirmation is just the order number shown once. Say if you want a "look up my order" page.

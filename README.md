# Order Booking System (Ghee/Oil)

Two separate pieces:

1. **`/book`** — a public, no-login order booking page (share this URL). Shows Item / Qty / Amount / Weight — only Qty is editable, everything else is computed and read-only. Rate is used internally to compute Amount but is never displayed.
2. **`/admin`** — a separate, password-protected area where item names, weights, and rates live. Nothing on `/book` can change them.

## Weight and rate (v2)

Each item's **weight (kg per unit)** and **rate (per unit)** are stored directly on the item — entered by the admin, not derived or parsed from the item's name. Change either any time in `/admin/items`; every future order picks up the new value immediately (past orders keep their original snapshot).

- Amount (per line) = Qty × Rate
- Weight (per line) = Qty × Weight
- The `/book` page footer shows **Total Amount** and **Total Weight** (combined, in kg) across all lines.

`type` (ghee/oil/other) is still stored per item for your own bookkeeping/reporting, but it's not shown on the booking page and doesn't affect the weight calculation.

## Setting up the database

- **Fresh Supabase project:** run `supabase/schema.sql`.
- **Already ran the old (v1) schema.sql on a live project:** run `supabase/migration_v2_explicit_weights.sql` instead — it adds the new `weight_kg` columns, replaces the item catalog with the current name/weight/rate list, and fixes a bug in the old version where the weight total was being multiplied by quantity twice. It does **not** touch your existing `orders` rows, only `items` (whose rows are safely replaced — any past `order_items` keep their own snapshot regardless).

Then fill in `.env.local` from `.env.example` (4 values: Supabase URL + service key, admin password + session secret) and:
```bash
npm install
npm run dev
```
`http://localhost:3000` redirects to `/book`. `/admin/login` gets you into the admin area.

## API routes

Public:
- `GET /api/items` — active catalog (includes rate/weight for client-side calc, even though the UI doesn't render those columns)
- `POST /api/orders` — submit an order (`{ customer_name, customer_contact?, notes?, lines: [{item_id, qty}] }`). Rate, weight, and type are always re-fetched from the current catalog server-side — a tampered request can't book at a fake price or weight.

Admin (behind the password):
- `GET/POST /api/admin/items`, `PATCH/DELETE /api/admin/items/[id]`, `POST /api/admin/items/reorder`
- `GET/PATCH /api/admin/settings` — generic key/value store, currently unused by the booking flow (kept for future config)
- `GET /api/admin/orders`, `GET/PATCH /api/admin/orders/[id]`
- `POST /api/admin/orders/export` — `.xlsx` with three sheets: **Orders** (one row per order, with Amount and total Weight), **Item Totals** (aggregated Item/Qty/Rate/Amount/Weight/Type across the selected orders, with an Amount/Weight footer), and **Line Items** (every line of every selected order)

## Admin protection

`/admin/*` and `/api/admin/*` are gated by `middleware.ts` behind a single shared password (`ADMIN_PASSWORD`) and a signed session cookie (`ADMIN_SESSION_SECRET`, 12-hour expiry). Simple by design — swap for Supabase Auth later if multiple staff need distinct logins.

## Things you may want to double check

- The seeded weights/rates match what you gave me, including three RSO variants (250ml/500ml/1000ml) all sharing the same weight (5.46) and Soap Carton showing weight 10 — worth a sanity check in `/admin/items` in case that was a transcription slip on the source sheet, not intentional.

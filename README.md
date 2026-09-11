# Order Booking System

Small standalone system for:
- Booking orders (customer, origin/destination, weight, rate, extra charges → auto total)
- Managing rate cards (per route, per weight slab)
- Auto-filling an order's rate from the matching rate card when origin + destination + weight are entered (still editable)
- Exporting selected or filtered orders to an `.xlsx` file, generated on the backend and downloaded from the browser

## Stack
Next.js (App Router, API routes) + Supabase (Postgres). Excel files are generated server-side with `xlsx` (SheetJS) and streamed back as a download — nothing is written to disk.

## Setup

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the Supabase SQL editor. It creates `orders` and `rate_cards` tables, an auto-incrementing `order_number`, a generated `total_amount` column (`weight_kg * rate_per_kg + extra_charges`), and RLS enabled (bypassed by the service role key used server-side).
3. Copy `.env.example` to `.env.local` and fill in:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY` (Project Settings → API → service_role — keep this secret, it's only used in API routes)
4. Install and run:
   ```bash
   npm install
   npm run dev
   ```
5. Open `http://localhost:3000` — it redirects to `/orders`.

## Pages
- `/orders` — book a new order, filter by status, select rows (checkboxes) and export to Excel. If no rows are selected, export uses the current status filter (or all orders if no filter).
- `/rates` — add rate cards per origin/destination and optional weight slab (min/max kg). Orders auto-fill their rate from the best-matching active rate card.

## API routes
- `GET/POST /api/orders` — list (with `status`, `from`, `to`, `q` filters) / create
- `GET/PATCH/DELETE /api/orders/[id]` — single order
- `GET/POST /api/rates` — list or rate-lookup (`?origin=&destination=&weight=`) / create
- `POST /api/orders/export` — body `{ ids? , status?, from?, to? }` → returns a downloadable `.xlsx` with an Orders sheet and a Summary sheet (count, total weight, total amount)

## Notes / things you may want to adjust
- `total_amount` is a Postgres generated column (`weight_kg * rate_per_kg + extra_charges`) — it can't be set manually, only recomputed from its inputs.
- Rate auto-fill picks the active rate card for the exact origin/destination whose weight slab contains the entered weight. If you want fuzzy/partial route matching, that logic lives in `app/api/rates/route.ts`.
- No auth is wired up yet — add it in front of these routes (e.g. middleware checking a session) before exposing this beyond local/internal use.
- Deploy the same way as your other projects: Vercel for the Next.js app, Supabase hosted as-is.

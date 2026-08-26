-- Order source (local vs PedidosYa) + frozen commission amount
-- Adds two columns to `orders`:
--   - `source`: which channel the order came from. Orders are still entered
--     manually through the existing wizard — this is not an API integration,
--     just a flag chosen at order-creation time. NULL for every row that
--     predates this column; the app treats NULL as "unknown", never as
--     "local" — see bucketBySource in lib/hooks/orders/use-orders-history.ts.
--   - `commission_amount` / `commission_rate`: PedidosYa charges a
--     commission per sale. The % is configured in /precios and lives in
--     localStorage (per-device), so it CANNOT be applied at read time — two
--     devices would show different net revenue for the same period, and
--     changing the % would rewrite history. Instead both the resolved
--     amount AND the rate that produced it are computed once, at order
--     creation, and frozen onto the row — the same pattern `orders` already
--     uses for discount_type/discount_value/discount_amount. `commission_rate`
--     is what lets an edit to an existing PedidosYa order (e.g. changing
--     items) recompute `commission_amount` from the item's new total at the
--     ORIGINAL rate, instead of silently picking up today's configured %.
--
-- BEFORE RUNNING ON PRODUCTION: run these two checks first, in a separate
-- query, since scripts/001-create-schema.sql is known to be out of date vs.
-- production (payment_method, delivery_type, discount_* etc. were all added
-- directly in Supabase, never scripted) and this repo cannot verify the live
-- schema on its own.
--
--   -- (a) must return exactly ONE row:
--   SELECT tablename FROM pg_tables
--   WHERE schemaname = 'public' AND tablename = 'orders';
--
--   -- (b) must return ZERO rows:
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_schema = 'public'
--     AND table_name = 'orders'
--     AND column_name IN ('source', 'commission_amount', 'commission_rate');
--
-- If (a) returns zero rows, scripts/001-create-schema.sql was never
-- applied — STOP. If (b) returns any row, at least one of these columns
-- already exists (possibly with a different type) — STOP and inspect it
-- instead of running this.
--
-- ADD COLUMN IF NOT EXISTS is deliberately NOT used: it would silently
-- succeed against a pre-existing column of the wrong type, which is exactly
-- the failure this script needs to be loud about.
--
-- The script is wrapped in a transaction: if any statement fails, nothing
-- partially applies.
--
-- Undo, if ever needed:
--   ALTER TABLE orders DROP COLUMN source;
--   ALTER TABLE orders DROP COLUMN commission_amount;
--   ALTER TABLE orders DROP COLUMN commission_rate;

BEGIN;

-- Nullable and unconstrained on purpose: legacy rows have no source, and
-- there is no CHECK ('local'/'pedidosya') here — this schema validates
-- values in the UI/TS layer rather than with constraints, following the
-- precedent set by purchase_mode in scripts/009-supply-purchase-basis.sql.
ALTER TABLE orders ADD COLUMN source TEXT;

-- DECIMAL(10, 2) matches total_amount's precision (both are currency).
-- NOT NULL DEFAULT 0 so every pre-existing row sums to zero commission
-- without needing a backfill, and is safe to add in place on modern
-- Postgres (metadata-only, no table rewrite).
ALTER TABLE orders ADD COLUMN commission_amount DECIMAL(10, 2) NOT NULL DEFAULT 0;

-- Nullable — null for every order that isn't PedidosYa (source <> 'pedidosya'),
-- same as source itself. Paired with discount_value alongside discount_amount:
-- this is the rate that produced commission_amount, kept so an edit can
-- recompute the amount from a new total without drifting off the rate that
-- was actually in effect when the order was created.
ALTER TABLE orders ADD COLUMN commission_rate DECIMAL(5, 2);

COMMIT;

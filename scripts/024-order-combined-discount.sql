-- Combined discount (percentage + fixed amount on the same order)
-- Adds two columns to `orders`:
--   - `discount_percentage`: percentage part of the discount (0-100).
--   - `discount_fixed`: fixed-amount part of the discount, in currency.
--
-- Until now an order could carry a percentage OR a fixed amount, never both
-- (discount_type was a single enum: 'none' | 'percentage' | 'amount'). Both
-- parts are applied to the items subtotal, percentage first and then the
-- fixed amount, clamped so the discount never exceeds the subtotal. That
-- logic lives in the TS layer (OrderPriceCalculator), not in the DB.
--
-- COMPATIBILITY (this runs against production, so nothing existing changes):
--   - Purely additive: no column is dropped, renamed or retyped.
--   - `discount_amount` keeps meaning "total discount in currency". Totals,
--     the WhatsApp message and the print service read ONLY this column.
--   - `discount_type` / `discount_value` stay as LEGACY columns. They are
--     still written (see below) because orders_discount_type_check only
--     accepts 'amount' | 'percentage' | 'none', so a new enum value such as
--     'both' would make every combined order fail to insert. The installed
--     print service .exe also still reads them for its label.
--       percentage only -> type 'percentage', value = percentage
--       fixed only      -> type 'amount',     value = fixed amount
--       both            -> type 'amount',     value = total discount_amount
--       none            -> type 'none',       value = 0
--
-- ORDER OF DEPLOYMENT: run this script FIRST, then deploy the app code.
-- The old code ignores the new columns, so running it early is harmless.
-- Rows created between this backfill and the deploy keep the legacy
-- columns only; the app falls back to discount_type/discount_value when both
-- new columns are 0, and the backfill below can be safely re-run (it only
-- touches rows where both new columns are still 0).
--
-- BEFORE RUNNING ON PRODUCTION: run these checks first, in a separate query,
-- since discount_* columns were added directly in Supabase and never
-- scripted:
--
--   -- (a) must return ZERO rows:
--   SELECT column_name FROM information_schema.columns
--   WHERE table_schema = 'public'
--     AND table_name = 'orders'
--     AND column_name IN ('discount_percentage', 'discount_fixed');
--
--   -- (b) legacy distribution, expected: only amount / percentage / none
--   SELECT discount_type, count(*) FROM orders GROUP BY 1;
--
-- If (a) returns any row, STOP and inspect it instead of running this.
-- Take a backup / snapshot of `orders` before running.
--
-- ADD COLUMN IF NOT EXISTS is deliberately NOT used: it would silently
-- succeed against a pre-existing column of the wrong type.
--
-- The script is wrapped in a transaction: if any statement fails, nothing
-- partially applies.
--
-- AFTER RUNNING, verify (both must return 0):
--   SELECT count(*) FROM orders
--   WHERE discount_type = 'percentage' AND discount_percentage <> discount_value;
--   SELECT count(*) FROM orders
--   WHERE discount_type = 'amount' AND discount_fixed <> discount_value;
--
-- Undo, if ever needed (legacy columns are untouched, so nothing is lost):
--   ALTER TABLE orders DROP COLUMN discount_percentage;
--   ALTER TABLE orders DROP COLUMN discount_fixed;

BEGIN;

-- NOT NULL DEFAULT 0 so every pre-existing row reads as "no discount" for
-- the new parts without a rewrite (metadata-only on modern Postgres).
-- DECIMAL(10, 2) matches discount_value/discount_amount. No CHECK
-- constraint, same convention as price_adjustment in
-- scripts/016-order-price-adjustment.sql: values are validated in TS.
ALTER TABLE orders ADD COLUMN discount_percentage DECIMAL(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN discount_fixed DECIMAL(10, 2) NOT NULL DEFAULT 0;

-- Backfill from the legacy columns. discount_value (what the user typed) is
-- used, not discount_amount (already clamped), so editing an old order
-- recomputes exactly as it did before.
UPDATE orders
SET discount_percentage = COALESCE(discount_value, 0)
WHERE discount_type = 'percentage'
  AND discount_percentage = 0
  AND discount_fixed = 0;

UPDATE orders
SET discount_fixed = COALESCE(discount_value, 0)
WHERE discount_type = 'amount'
  AND discount_percentage = 0
  AND discount_fixed = 0;

COMMIT;

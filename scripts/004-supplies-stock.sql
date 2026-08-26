-- Manual on-hand stock per supply
-- Adds a single, manually-maintained quantity column to `supplies`.
--
-- This is NOT live inventory: nothing deducts from it automatically. It is
-- updated by hand from the Insumos tab (stock count / after a delivery),
-- exactly like cost_per_unit is maintained by hand on the same table.
-- Automatic deduction on order completion was considered and explicitly
-- rejected: combo order rows carry burger_id = NULL and the sold burger only
-- exists inside a 3-format-historical JSON blob in customizations.
--
-- BEFORE RUNNING ON PRODUCTION: run these two checks first, in a separate
-- query, since scripts/001-create-schema.sql is known to be out of date vs.
-- production and this repo cannot verify the live schema on its own.
--
--   -- (a) must return exactly ONE row:
--   SELECT tablename FROM pg_tables
--   WHERE schemaname = 'public' AND tablename = 'supplies';
--
--   -- (b) must return ZERO rows:
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_schema = 'public'
--     AND table_name = 'supplies'
--     AND column_name = 'stock_quantity';
--
-- If (a) returns zero rows, scripts/003-costs-schema.sql was never applied —
-- STOP. If (b) returns any row, the column already exists (possibly with a
-- different type) — STOP and inspect it instead of running this.
--
-- ADD COLUMN IF NOT EXISTS is deliberately NOT used: it would silently
-- succeed against a pre-existing column of the wrong type, which is exactly
-- the failure this script needs to be loud about.
--
-- The script is wrapped in a transaction: if the statement fails, nothing
-- partially applies.
--
-- Undo, if ever needed: ALTER TABLE supplies DROP COLUMN stock_quantity;

BEGIN;

-- DECIMAL(10, 3) intentionally matches burger_supplies.quantity's precision:
-- "alcanza para" divides stock_quantity by burger_supplies.quantity, so both
-- sides must express the same unit at the same granularity (the `unit`
-- column is free text and there is no conversion system).
-- NOT NULL DEFAULT 0 is safe to add in place on modern Postgres (metadata
-- only, no table rewrite), and `supplies` is a small table regardless.
-- No CHECK (stock_quantity >= 0): 003 validates cost_per_unit and quantity
-- in the UI rather than with constraints, and this follows that precedent.
ALTER TABLE supplies ADD COLUMN stock_quantity DECIMAL(10, 3) NOT NULL DEFAULT 0;

COMMIT;

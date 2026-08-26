-- Optional link from a one-off expense to the supply it purchased
--
-- Today, logging an expense with category = 'supplies' is free-text only —
-- `description` might say "10kg de carne", but nothing connects that
-- purchase to the `supplies` catalog or its `stock_quantity`. Restocking is
-- a second, disconnected step done by hand from the Insumos tab.
--
-- `supply_id` + `quantity` let the user optionally say WHICH supply was
-- bought and HOW MUCH, at the time the expense is logged, so the app can
-- bump `supplies.stock_quantity` for them instead of requiring both the
-- expense and the restock to be entered separately. Both columns are
-- nullable and there is no CHECK tying them to category = 'supplies': an
-- expense is a historical record of money spent, not a supplies-catalog
-- operation, and the free-text-only flow must keep working exactly as
-- before when the user doesn't pick a supply. Validation of "quantity only
-- makes sense when supply_id is set" stays in the UI, consistent with how
-- this schema already validates everything else (cost_per_unit, stock_quantity,
-- unit_weight_grams) at the application layer rather than with constraints.
--
-- ON DELETE SET NULL (not RESTRICT, unlike burger_supplies.supply_id): an
-- expense is a historical ledger entry — deleting the supply it once
-- referenced must not block the delete or corrupt the ledger, it should
-- just detach the link.
--
-- BEFORE RUNNING ON PRODUCTION: run these three checks first, in a separate
-- query, since scripts/001-create-schema.sql is known to be out of date vs.
-- production and this repo cannot verify the live schema on its own.
--
--   -- (a) must return exactly ONE row each:
--   SELECT tablename FROM pg_tables
--   WHERE schemaname = 'public' AND tablename = 'expenses';
--   SELECT tablename FROM pg_tables
--   WHERE schemaname = 'public' AND tablename = 'supplies';
--
--   -- (b) must return ZERO rows:
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_schema = 'public'
--     AND table_name = 'expenses'
--     AND column_name IN ('supply_id', 'quantity');
--
-- If (a) returns zero rows for either table, scripts/003-costs-schema.sql
-- was never applied — STOP. If (b) returns any row, one of these columns
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
--   ALTER TABLE expenses DROP COLUMN supply_id;
--   ALTER TABLE expenses DROP COLUMN quantity;

BEGIN;

ALTER TABLE expenses ADD COLUMN supply_id UUID REFERENCES supplies(id) ON DELETE SET NULL;

-- DECIMAL(10, 3) matches supplies.stock_quantity and burger_supplies.quantity's
-- precision: this value is added straight onto stock_quantity, so both sides
-- must express the same unit at the same granularity.
ALTER TABLE expenses ADD COLUMN quantity DECIMAL(10, 3);

COMMIT;

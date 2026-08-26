-- Optional bulk-purchase conversion for supplies tracked in discrete portions
--
-- Some supplies are tracked (and consumed by recipes) as a discrete portion
-- — e.g. "Carne" in `unit = "medallón"`, one per burger — but purchased in
-- bulk weight (kilos of raw meat) that then gets divided into portions by
-- hand. Restocking such a supply today means doing that division in your
-- head every time: "I bought 10kg, each medallón is 180g, so that's 55".
--
-- `unit_weight_grams` records that conversion factor once, per supply: how
-- many grams one unit of `supplies.unit` weighs. The Insumos tab's "Sumar
-- stock" popover uses it to let the user type kilos purchased and get the
-- portion count computed automatically (floored — a partial portion never
-- counts, same under-reporting-is-safe direction as `calculateLineMakeable`
-- in lib/utils/costing.ts).
--
-- NULL (the default) means "no conversion configured" — the overwhelming
-- majority of supplies are tracked in the same unit they're purchased in
-- (gramo, ml, unidad) and never need this. It only applies to the discrete-
-- portion-but-bulk-purchased case described above.
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
--     AND column_name = 'unit_weight_grams';
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
-- Undo, if ever needed: ALTER TABLE supplies DROP COLUMN unit_weight_grams;

BEGIN;

-- Nullable, no default: unlike stock_quantity (every supply has a stock
-- level, even if it's 0), most supplies never have a bulk-purchase
-- conversion at all — NULL is "not applicable", not "not yet counted".
-- DECIMAL(10, 3) mirrors stock_quantity / burger_supplies.quantity's
-- precision for the same reason: fractional grams-per-portion are a real
-- input (e.g. a 178.5g medallón), not noise to round away.
-- No CHECK (unit_weight_grams > 0): this table validates in the UI rather
-- than with constraints (see 003, 004), and this follows that precedent.
ALTER TABLE supplies ADD COLUMN unit_weight_grams DECIMAL(10, 3);

COMMIT;

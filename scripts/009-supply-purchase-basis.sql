-- Purchase-basis context for a supply's cost_per_unit
--
-- `supplies.cost_per_unit` has always been a derived number the user had to
-- compute in their head before typing it in: "the box of 55 medallones cost
-- $50.000, so that's $909,09 each". The Insumos modal's old "Calcular desde
-- precio de paquete" helper gave the user that division, but never kept the
-- inputs — reopening an edited supply lost the $50.000/55 entirely and left
-- only the bare result.
--
-- These three columns let the create/edit modal remember HOW the user
-- arrived at cost_per_unit, so re-editing a supply reopens it in the same
-- purchase mode with the original numbers, instead of just the computed
-- result:
--
--   purchase_mode  'unit'    — cost_per_unit typed directly, no conversion
--                  'package' — cost_per_unit = purchase_price / purchase_units
--                  'weight'  — cost_per_unit = purchase_price (per kilo) *
--                              (unit_weight_grams / 1000); reuses the existing
--                              unit_weight_grams column instead of duplicating it
--                  NULL      — legacy: supply created/last edited before this
--                              change, no purchase context recorded
--   purchase_price  the package price ('package' mode) or the price per kilo
--                   ('weight' mode); NULL in 'unit' mode and for legacy rows
--   purchase_units  units per package; only meaningful in 'package' mode
--
-- `cost_per_unit` itself is untouched and remains the single source of truth
-- for every downstream calculation (costing.ts, margins, suggested price,
-- inventory value) — these three columns are provenance, not a replacement.
--
-- No backfill: existing rows get purchase_mode = NULL, which the UI treats
-- as "unit" mode pre-filled with the existing cost_per_unit — correct,
-- since we genuinely don't know how those were originally computed.
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
--     AND column_name IN ('purchase_mode', 'purchase_price', 'purchase_units');
--
-- If (a) returns zero rows, scripts/003-costs-schema.sql was never applied —
-- STOP. If (b) returns any row, at least one of these columns already exists
-- (possibly with a different type) — STOP and inspect it instead of running
-- this.
--
-- ADD COLUMN IF NOT EXISTS is deliberately NOT used: it would silently
-- succeed against a pre-existing column of the wrong type, which is exactly
-- the failure this script needs to be loud about.
--
-- The script is wrapped in a transaction: if any statement fails, nothing
-- partially applies.
--
-- Undo, if ever needed:
--   ALTER TABLE supplies DROP COLUMN purchase_mode;
--   ALTER TABLE supplies DROP COLUMN purchase_price;
--   ALTER TABLE supplies DROP COLUMN purchase_units;

BEGIN;

-- No CHECK constraint restricting the values ('unit'/'package'/'weight'):
-- this table validates in the UI rather than with constraints (see 003,
-- 004, 007), and this follows that precedent.
ALTER TABLE supplies ADD COLUMN purchase_mode TEXT;

-- Same precision as cost_per_unit — this is a price, not a computed cost.
ALTER TABLE supplies ADD COLUMN purchase_price DECIMAL(10, 2);

-- DECIMAL(10, 3) mirrors unit_weight_grams / stock_quantity's precision:
-- fractional units-per-package are a real input, not noise to round away.
ALTER TABLE supplies ADD COLUMN purchase_units DECIMAL(10, 3);

COMMIT;

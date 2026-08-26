-- Payment frequency for recurring expense templates (weekly / biweekly /
-- monthly). Existing rows default to 'monthly', preserving their current
-- behavior exactly — this is purely additive, no behavior change for
-- anything already loaded.
--
-- BEFORE RUNNING ON PRODUCTION: run these two checks first, in a separate
-- query, since scripts/001-create-schema.sql is known to be out of date vs.
-- production and this repo cannot verify the live schema on its own.
--
--   -- (a) must return exactly ONE row:
--   SELECT tablename FROM pg_tables
--   WHERE schemaname = 'public' AND tablename = 'recurring_expenses';
--
--   -- (b) must return ZERO rows:
--   SELECT column_name FROM information_schema.columns
--   WHERE table_schema = 'public'
--     AND table_name = 'recurring_expenses'
--     AND column_name = 'frequency';
--
-- If (a) returns zero rows, scripts/003-costs-schema.sql was never applied —
-- STOP. If (b) returns any row, the column already exists — STOP and inspect
-- it instead of running this.
--
-- ADD COLUMN IF NOT EXISTS is deliberately NOT used: it would silently
-- succeed against a pre-existing column of the wrong type, which is exactly
-- the failure this script needs to be loud about.
--
-- Adding a column with both a constant DEFAULT and a CHECK referencing only
-- that new column is a fast, non-table-rewriting operation on modern
-- Postgres — every existing row trivially satisfies the check via the
-- default, so no full-table validation scan is required. This is the same
-- category of change as the `category` CHECK constraints already live on
-- this exact table from 003-costs-schema.sql.
--
-- The script is wrapped in a transaction: if the statement fails, nothing
-- partially applies.
--
-- Undo, if ever needed: ALTER TABLE recurring_expenses DROP COLUMN frequency;

BEGIN;

ALTER TABLE recurring_expenses
  ADD COLUMN frequency TEXT NOT NULL DEFAULT 'monthly'
    CHECK (frequency IN ('weekly', 'biweekly', 'monthly'));

COMMIT;

-- Backfill source on external_income for historical PedidosYa lump sums
--
-- WHY: before the order-source feature (scripts/010-order-source.sql),
-- PedidosYa sales were never entered as real `orders` rows — they were
-- logged as a lump amount in `external_income` instead, with no structured
-- way to tell a PedidosYa row apart from any other external income (events,
-- catering, etc.). This adds a `source` column to `external_income` so
-- analytics (lib/hooks/orders/use-orders-history.ts) can fold historical
-- PedidosYa income into the same "pedidosya" bucket real PedidosYa orders
-- land in, instead of dumping 100% of external_income into "unknown".
--
-- This does NOT add a UI selector for `external_income.source` — the
-- "Ingresos externos" panel (components/analytics/external-income-panel.tsx)
-- stays as-is for logging future non-PedidosYa external charges. `source`
-- here is populated once, by this backfill, from existing descriptions.
--
-- BEFORE RUNNING ON PRODUCTION: run these two checks first, in a separate
-- query, since `external_income` was created directly in Supabase and was
-- never scripted in this repo (same situation payment_method was in on
-- `orders` before scripts/001-create-schema.sql) — this repo cannot verify
-- the live schema on its own.
--
--   -- (a) must return exactly ONE row:
--   SELECT tablename FROM pg_tables
--   WHERE schemaname = 'public' AND tablename = 'external_income';
--
--   -- (b) must return ZERO rows:
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_schema = 'public'
--     AND table_name = 'external_income'
--     AND column_name = 'source';
--
-- If (a) returns zero rows, `external_income` doesn't exist where expected —
-- STOP. If (b) returns a row, `source` already exists (possibly with a
-- different type) — STOP and inspect it instead of running this.
--
-- ADD COLUMN IF NOT EXISTS is deliberately NOT used: it would silently
-- succeed against a pre-existing column of the wrong type, which is exactly
-- the failure this script needs to be loud about.
--
-- The script is wrapped in a transaction: if any statement fails, nothing
-- partially applies.
--
-- Undo, if ever needed:
--   ALTER TABLE external_income DROP COLUMN source;

BEGIN;

-- Nullable and unconstrained on purpose — same precedent as orders.source
-- (scripts/010-order-source.sql) and purchase_mode
-- (scripts/009-supply-purchase-basis.sql): this schema validates values in
-- the UI/TS layer, not with DB constraints. NULL means "some other external
-- income, not PedidosYa" — that is the correct, intended default for
-- anything this backfill doesn't explicitly match, and for every future row
-- logged through the panel without a PedidosYa description.
ALTER TABLE external_income ADD COLUMN source TEXT;

COMMIT;

-- Run this SELECT separately FIRST, before the backfill UPDATE below, to
-- review exactly which rows will be touched. It uses the identical WHERE
-- clause as the real UPDATE, so what you review here is exactly what gets
-- written — eyeball it, since the regex is heuristic and could
-- false-positive/negative on freeform descriptions.
--
--   SELECT id, date, amount, description
--   FROM external_income
--   WHERE source IS NULL
--     AND description ~* '(pedidos\s*ya|pedidosya|p\.?\s*ya|peyya|peya|pya)';

BEGIN;

-- Flags historical external_income rows as PedidosYa revenue based on their
-- description, so analytics can stop dumping them into "unknown". The regex
-- covers casual spellings — pya, peya, peyya, "pedidos ya", "p.ya", PedidosYa —
-- case-insensitively via Postgres `~*`. A human must eyeball the pre-flight
-- SELECT's results above before running this.
UPDATE external_income
SET source = 'pedidosya'
WHERE source IS NULL
  AND description ~* '(pedidos\s*ya|pedidosya|p\.?\s*ya|peyya|peya|pya)';

COMMIT;

-- These rows are NET amounts — PedidosYa's commission was already deducted
-- before this money hit the books (unlike an `orders` row, which stores a
-- GROSS total_amount with commission_amount/commission_rate frozen
-- separately). There is deliberately no commission column added here to
-- external_income; do not add one — the commission on this historical
-- revenue was never recorded and cannot be recovered, only the net payout
-- was.

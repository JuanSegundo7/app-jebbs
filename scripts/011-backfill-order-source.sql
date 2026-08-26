-- Backfill orders.source for rows predating scripts/010-order-source.sql
--
-- WHY: `source` (added in 010) has no backfill — every order created before
-- that migration has `source IS NULL`, and the app treats NULL as "unknown"
-- (see bucketBySource in lib/hooks/orders/use-orders-history.ts), never as
-- "local". But those NULL rows ARE, factually, local orders: PedidosYa sales
-- were never entered through the wizard as real `orders` rows before this
-- feature existed — they were logged as a single lump amount in
-- `external_income` instead (see scripts/012-external-income-source.sql for
-- the matching backfill on that table). So every pre-migration order can be
-- safely and unambiguously reclassified as `source = 'local'`.
--
-- BEFORE RUNNING ON PRODUCTION: run this check first, in a separate query.
--
--   -- (a) how many rows this script will touch:
--   SELECT COUNT(*) FROM orders WHERE source IS NULL;
--
--   -- (b) must return ZERO rows — a NULL-source row with commission already
--   -- set would mean a PedidosYa order got miscategorized as unknown-source
--   -- instead of being tagged 'pedidosya' at creation time:
--   SELECT id, source, commission_amount, commission_rate
--   FROM orders
--   WHERE source IS NULL
--     AND commission_amount > 0;
--
-- If (b) returns any rows, STOP and investigate instead of running this —
-- do not blanket-assign 'local' to an order that already carries a
-- PedidosYa commission.
--
-- The script is wrapped in a transaction: if the statement fails, nothing
-- partially applies.
--
-- Undo, if ever needed:
--   UPDATE orders SET source = NULL WHERE source = 'local';
--
-- NOTE: this undo is imprecise, not a safe blanket rollback — it would also
-- null out orders that were legitimately created with source = 'local'
-- AFTER the 010 migration (i.e. through the wizard, not by this backfill).
-- It's provided only as a reference for what this script did, not as
-- something safe to run without further filtering.

BEGIN;

UPDATE orders SET source = 'local' WHERE source IS NULL;

COMMIT;

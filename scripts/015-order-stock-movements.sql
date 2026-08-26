-- Idempotency ledger for automatic stock deduction on order completion
--
-- WHY: Phase 1 (scripts/013-extra-supplies.sql, scripts/014-burger-supply-
-- scaling.sql) gave burgers and extras correct recipes, but selling
-- something never touched `supplies.stock_quantity` — the whole point of
-- this phase is to close that gap. When an order reaches `status =
-- 'completed'`, the app deducts the stock its items actually consumed; if
-- the order later leaves `completed` (canceled, or reactivated back to
-- `new`), the deduction is reversed exactly.
--
-- This table is that mechanism's source of truth for "has this already been
-- deducted?". A row's existence means "this quantity is CURRENTLY
-- subtracted from supplies.stock_quantity for this order, for this
-- supply". Deduction INSERTs the row; reversal DELETEs it — reversal never
-- writes a compensating negative row. `quantity` is therefore ALWAYS
-- POSITIVE: "amount subtracted", never a signed delta. Reading this table
-- backwards (e.g. summing quantity to get "total ever deducted") would be
-- wrong for exactly this reason — a reversed order simply has no row here
-- at all, not a row that cancels out to zero.
--
-- Deliberately named `order_stock_movements`, NOT a generic
-- `stock_movements`: manual stock edits (Insumos tab), restocks, and
-- expense-linked stock bumps (lib/hooks/use-expenses.ts) do not write here
-- and never will. A generic name would wrongly invite treating this table
-- as the complete stock history — it is only ever the record of what
-- automatic order-completion deduction did.
--
-- `ON DELETE RESTRICT` on `order_id` — a deliberate DEPARTURE from the
-- `ON DELETE CASCADE` precedent extra_supplies uses on its own parent FK
-- (extra_id -> extras). Nothing in this codebase hard-deletes an `orders`
-- row today (verified). RESTRICT is a guardrail against an out-of-band
-- deletion (e.g. via the Supabase console) silently dropping this ledger —
-- if that ever happened, the deducted stock would be left with no way to
-- trace it back to the order that consumed it. CASCADE would have been the
-- "consistent with the rest of the schema" choice, but it would make that
-- failure mode silent instead of loud, which is the wrong tradeoff for a
-- ledger whose entire job is to be trustworthy.
--
-- `ON DELETE RESTRICT` on `supply_id`, matching `burger_supplies` and
-- `extra_supplies` exactly: a supply with recorded movements can't be
-- deleted, so the record of what it lost is never destroyed. NOTE: this
-- means `components/costos/supplies-tab.tsx`'s existing FK-blocked-delete
-- message (already updated once in Phase 1 to mention "used in a recipe")
-- will need updating in a later batch to also mention "used in completed
-- orders" — that file is out of scope for this change, this comment only
-- documents the dependency for whoever picks up that batch.
--
-- No CHECK constraints (house convention — see purchase_mode/source/
-- scales_with precedent). `UNIQUE (order_id, supply_id)` is the only index
-- needed beyond the explicit supply_id one below — its composite btree
-- already covers every `WHERE order_id = ?` lookup as a leading-column
-- prefix match, which is the only query shape this table serves on the hot
-- path (the idempotency check in applyOrderStockDeduction and the full-row
-- fetch in reverseOrderStockDeduction both filter by order_id alone).
--
-- BEFORE RUNNING ON PRODUCTION: run these two checks first, in a separate
-- query, since scripts/001-create-schema.sql is known to be out of date vs.
-- production and this repo cannot verify the live schema on its own.
--
--   -- (a) must return exactly TWO rows (both parent tables must exist):
--   SELECT tablename FROM pg_tables
--   WHERE schemaname = 'public' AND tablename IN ('orders', 'supplies');
--
--   -- (b) must return ZERO rows:
--   SELECT tablename FROM pg_tables
--   WHERE schemaname = 'public' AND tablename = 'order_stock_movements';
--
-- If (a) returns fewer than two rows, `orders` and/or `supplies` don't
-- exist where expected — STOP. If (b) returns a row, `order_stock_movements`
-- already exists — STOP and inspect it instead of running this.
--
-- The script is wrapped in a transaction: if any statement fails, nothing
-- partially applies.
--
-- Undo, if ever needed:
--   DROP TABLE order_stock_movements;
--
--   CAVEAT (real, not boilerplate): this destroys the record of which
--   orders already had stock deducted. A completed order would become
--   indistinguishable from one that was never deducted — reactivating it
--   (new -> ready -> completed again) would deduct its stock a SECOND
--   time, and no order that was completed before the drop could ever be
--   reversed again (canceling it afterward would silently do nothing,
--   since reversal reads this table to know what to undo). Do not run this
--   undo while any completed order might still be canceled or reactivated
--   later.

BEGIN;

CREATE TABLE order_stock_movements (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id   UUID NOT NULL REFERENCES orders(id)   ON DELETE RESTRICT,
  supply_id  UUID NOT NULL REFERENCES supplies(id) ON DELETE RESTRICT,
  quantity   DECIMAL(10, 3) NOT NULL, -- amount subtracted; always positive, never a signed delta
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (order_id, supply_id)
);

CREATE INDEX idx_order_stock_movements_supply_id ON order_stock_movements(supply_id);

-- Same wide-open RLS policy as every other table in this schema —
-- single-tenant app, no user_id/auth.uid scoping anywhere.
ALTER TABLE order_stock_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on order_stock_movements" ON order_stock_movements FOR ALL USING (true) WITH CHECK (true);

COMMIT;

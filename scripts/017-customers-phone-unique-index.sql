-- Unique index on customers.phone
-- Part of the landing-pedidos-jebbs chain (see .atl/sdd/landing-pedidos-jebbs/).
--
-- The upcoming public ordering landing looks up a customer by phone before
-- deciding whether to create a new `customers` row for a delivery order
-- (dedup: reuse the existing customer if the phone matches, otherwise
-- insert). Without a unique constraint, two delivery orders arriving at
-- nearly the same time from the same phone number can both miss on the
-- lookup and both insert, producing two `customers` rows for the same
-- person. Confirmed via WU0 pre-flight (Q4 of
-- .atl/sdd/landing-pedidos-jebbs/design.md): today `customers` has only its
-- primary-key index, nothing on `phone`.
--
-- `phone` is nullable (confirmed via WU0 Q1) and stays that way — a unique
-- index in Postgres does not enforce uniqueness among NULLs (each NULL is
-- distinct from every other NULL), so pickup orders and any existing
-- customer rows without a phone are unaffected.
--
-- BEFORE RUNNING ON PRODUCTION: run this check first, in a separate query —
-- it must return ZERO rows. If it returns any row, existing duplicate
-- phones will make CREATE UNIQUE INDEX fail; those rows need to be merged
-- or cleared by hand before this script can run.
--
--   SELECT phone, COUNT(*) FROM customers
--   WHERE phone IS NOT NULL
--   GROUP BY phone
--   HAVING COUNT(*) > 1;
--
-- CREATE INDEX CONCURRENTLY is deliberately NOT used here: it cannot run
-- inside a transaction block, and this repo's convention (see
-- scripts/016-order-price-adjustment.sql) wraps every migration in
-- BEGIN/COMMIT so a failure never partially applies. A plain CREATE UNIQUE
-- INDEX briefly locks writes to `customers` — negligible on a table this
-- size, but note it if this is ever run during a burst of live traffic.
--
-- Undo, if ever needed:
--   DROP INDEX customers_phone_unique;

BEGIN;

CREATE UNIQUE INDEX customers_phone_unique ON customers (phone);

COMMIT;

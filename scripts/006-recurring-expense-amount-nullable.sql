-- Recurring expenses: make `amount` optional
--
-- Weekly/biweekly ("quincenal") salaries paid by the hour don't have a
-- fixed amount known in advance — the actual figure varies week to week
-- and is logged manually, at the time it's known, as a one-off row in
-- `expenses` (category = 'salaries'). That one-off entry is what feeds
-- expensesTotal/netRevenue — it already worked before any of this
-- recurring-frequency feature existed, no change needed there.
--
-- A weekly/biweekly `recurring_expenses` row therefore becomes purely
-- informational from here on: description + frequency + start_date, no
-- amount, just a note of "this person gets paid on this cadence". It does
-- NOT generate any ledger/expense rows on its own anymore (application-side
-- change, not part of this migration).
--
-- Monthly-frequency templates (rent, services, monthly-paid salaries) are
-- UNCHANGED — they still require a real amount, since they still drive the
-- existing smoothed day-by-day proration. This migration only removes the
-- NOT NULL constraint; it does not touch monthly's behavior or validation,
-- which stays enforced at the UI layer (consistent with how this table's
-- other business rules — e.g. amount > 0 — were never enforced by a DB
-- CHECK to begin with).
--
-- BEFORE RUNNING ON PRODUCTION: run this check first, in a separate query:
--
--   SELECT column_name, is_nullable FROM information_schema.columns
--   WHERE table_schema = 'public'
--     AND table_name = 'recurring_expenses'
--     AND column_name = 'amount';
--
-- Expect exactly one row with is_nullable = 'NO' (the current state, from
-- scripts/003-costs-schema.sql). If it already reads 'YES', this migration
-- was already applied — STOP, don't run it again.

BEGIN;

ALTER TABLE recurring_expenses ALTER COLUMN amount DROP NOT NULL;

COMMIT;

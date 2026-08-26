-- Costs, expenses and net revenue — Phase 1
-- Adds: one-off expenses, recurring expense templates, supply catalog with
-- unit cost, and the burger recipe (bill of materials).
-- Does NOT add live stock/inventory — see plan for phase 2.
--
-- BEFORE RUNNING ON PRODUCTION: run this check first, in a separate query,
-- to confirm none of these table names collide with something already in
-- the live DB (scripts/001-create-schema.sql is known to be out of date
-- vs. production, so this repo cannot guarantee that on its own):
--
--   SELECT tablename FROM pg_tables
--   WHERE schemaname = 'public'
--     AND tablename IN ('expenses', 'recurring_expenses', 'supplies', 'burger_supplies');
--
-- That query must return zero rows. If it returns any, STOP and rename the
-- colliding table(s) in this script before running it.
--
-- The whole script is wrapped in a transaction: if any single statement
-- fails (e.g. the collision above was missed), everything rolls back and
-- nothing partially applies.

BEGIN;

-- Expenses table (one-off expenses: a single purchase, a single payment)
CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('supplies', 'services', 'salaries', 'rent', 'other')),
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Recurring expense templates (rent, salaries, utilities).
-- A template is prorated by days over whatever period analytics is showing.
-- Raising an amount = close this row with end_date and insert a new one.
-- Never UPDATE amount on a template that's currently active — that rewrites
-- past periods.
CREATE TABLE recurring_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  amount DECIMAL(10, 2) NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('supplies', 'services', 'salaries', 'rent', 'other')),
  description TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Supply catalog: raw ingredients/inputs with a unit cost.
-- `unit` is free text (e.g. "unidad", "gramo", "feta", "ml") — the user picks
-- the granularity; there is no unit-conversion system beyond this.
CREATE TABLE supplies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  unit TEXT NOT NULL,
  cost_per_unit DECIMAL(10, 2) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Burger recipe (bill of materials): how many units of each supply a given
-- burger uses. ON DELETE RESTRICT on supply_id is intentional — deleting a
-- supply that's used in a recipe must fail loudly, not silently empty recipes.
CREATE TABLE burger_supplies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  burger_id UUID NOT NULL REFERENCES burgers(id) ON DELETE CASCADE,
  supply_id UUID NOT NULL REFERENCES supplies(id) ON DELETE RESTRICT,
  quantity DECIMAL(10, 3) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (burger_id, supply_id)
);

-- Extras (sides/drinks/extras) get a unit cost too, so margin can be measured
-- on them without a whole new table — an extra is almost always one supply.
ALTER TABLE extras ADD COLUMN unit_cost DECIMAL(10, 2) NOT NULL DEFAULT 0;

-- Indexes
CREATE INDEX idx_expenses_date ON expenses(date);
CREATE INDEX idx_recurring_expenses_start_date ON recurring_expenses(start_date);
CREATE INDEX idx_burger_supplies_burger_id ON burger_supplies(burger_id);
CREATE INDEX idx_burger_supplies_supply_id ON burger_supplies(supply_id);

-- Enable Row Level Security (public access for this restaurant dashboard,
-- same wide-open policy as every other table — single-tenant app, no
-- user_id/auth.uid scoping anywhere in this schema)
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplies ENABLE ROW LEVEL SECURITY;
ALTER TABLE burger_supplies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on expenses" ON expenses FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on recurring_expenses" ON recurring_expenses FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on supplies" ON supplies FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on burger_supplies" ON burger_supplies FOR ALL USING (true) WITH CHECK (true);

COMMIT;

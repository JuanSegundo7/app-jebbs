-- Recipes (bill of materials) for extras
--
-- WHY: extras (sides/drinks/extras) have no real cost model today.
-- `burger_supplies.burger_id` is NOT NULL (scripts/003-costs-schema.sql:66),
-- so an extra can never own a row in that table — it's structurally
-- impossible for an extra to declare which supplies it consumes. This adds
-- `extra_supplies`, a standalone table with the same shape as
-- `burger_supplies`, so extras can finally have a recipe, a real unit cost,
-- and a real margin in /finanzas → Recetas.
--
-- `extras.unit_cost` (added by scripts/003-costs-schema.sql:75) is
-- deliberately left untouched by this script. It is dead: zero reads and
-- zero writes anywhere in the app today. Whether to backfill it from the
-- new recipe cost, repurpose it, or drop it is a separate decision this
-- script does not make.
--
-- `scales_with` (scripts/014-burger-supply-scaling.sql) is deliberately NOT
-- added to this table. Scaling exists to handle "doble" vs "simple"
-- burgers, driven by `burgers.default_meat_quantity`/`default_fries_quantity`
-- — an extra has no equivalent variable configuration to scale by.
--
-- BEFORE RUNNING ON PRODUCTION: run these two checks first, in a separate
-- query, since scripts/001-create-schema.sql is known to be out of date vs.
-- production and this repo cannot verify the live schema on its own.
--
--   -- (a) must return exactly ONE row:
--   SELECT tablename FROM pg_tables
--   WHERE schemaname = 'public' AND tablename = 'extras';
--
--   -- (b) must return ZERO rows:
--   SELECT tablename FROM pg_tables
--   WHERE schemaname = 'public' AND tablename = 'extra_supplies';
--
-- If (a) returns zero rows, `extras` doesn't exist where expected — STOP.
-- If (b) returns a row, `extra_supplies` already exists — STOP and inspect
-- it instead of running this.
--
-- The script is wrapped in a transaction: if any statement fails, nothing
-- partially applies.
--
-- Undo, if ever needed:
--   DROP TABLE extra_supplies;

BEGIN;

-- Recipe lines for an extra: how many units of each supply a given extra
-- consumes. Structural mirror of burger_supplies (scripts/003-costs-schema.sql)
-- — same column names/types, same ON DELETE semantics: CASCADE on extra_id
-- (deleting an extra deletes its recipe with it) and RESTRICT on supply_id
-- (deleting a supply that's still used in a recipe must fail loudly, not
-- silently empty recipes), same UNIQUE constraint shape.
CREATE TABLE extra_supplies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  extra_id UUID NOT NULL REFERENCES extras(id) ON DELETE CASCADE,
  supply_id UUID NOT NULL REFERENCES supplies(id) ON DELETE RESTRICT,
  quantity DECIMAL(10, 3) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (extra_id, supply_id)
);

CREATE INDEX idx_extra_supplies_extra_id ON extra_supplies(extra_id);
CREATE INDEX idx_extra_supplies_supply_id ON extra_supplies(supply_id);

-- Same wide-open RLS policy as every other table in this schema —
-- single-tenant app, no user_id/auth.uid scoping anywhere.
ALTER TABLE extra_supplies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on extra_supplies" ON extra_supplies FOR ALL USING (true) WITH CHECK (true);

COMMIT;

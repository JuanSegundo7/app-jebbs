-- Delivery zones — customer-chosen zone pricing, replacing the single flat
-- delivery fee.
--
-- Today the landing site (jebbs-landing) charges every delivery order the
-- same flat fee (an env var, DELIVERY_FEE_ARS=2000) regardless of where the
-- customer lives — even though the site's own delivery map already shows
-- customers different zone prices. The map has been lying: it promises a
-- per-zone price and the checkout always charges one flat fee. This
-- migration adds the table that becomes the single source of truth for
-- both the map and the actual charge, and lets the owner change a zone's
-- price from Configuración without a deploy.
--
-- `delivery_zones` columns:
--   - `fee` is CHECKed >= 0 — the one exception to this schema's usual
--     "validate in the UI/TS layer, not with constraints" convention (see
--     016/010): it's money charged to a customer, not internal bookkeeping.
--   - `is_active` — zones are soft-deleted only (UPDATE is_active = false).
--     There is no DELETE path: `orders.delivery_zone_id` below references a
--     zone with no ON DELETE clause (defaults to NO ACTION), so deleting a
--     zone that's ever been used on an order fails loudly instead of
--     orphaning/cascading through order history.
--   - `map_zone_key` is nullable and UNIQUE — matches a `data-zone="z1"`
--     path in public/delivery-zone-map.svg. A zone with no key still works
--     end to end (picker, pricing, WhatsApp) but isn't drawn on the map —
--     lets the owner add a 5th zone immediately, without waiting for
--     someone to trace a new polygon.
--   - Zone COLOR is deliberately NOT a column here: the four hex values
--     already live only in the SVG (`--zc` custom properties) and
--     delivery-zone-map.tsx's own comment already admits there's no single
--     source of truth for them. Adding a color column here would just be a
--     third place to keep in sync — the color stays a code-side palette
--     keyed by `map_zone_key`.
--   - No `city`/`postal_code`/coordinates: the owner explicitly rejected
--     geocoding for this change (customers pick their own zone from a
--     list; a badly automated calculation is worse than none). Nothing
--     here should tempt a future change into distance math.
--
-- `orders` gains three columns:
--   - `delivery_zone_id` — FK, no cascade (see above).
--   - `delivery_zone_name` — denormalized snapshot of the zone's name at
--     order time, same convention as order_items.burger_name /
--     orders.customer_name: renaming a zone next month must not rewrite
--     history or change what an old WhatsApp receipt says.
--   - `delivery_fee_pending` — true when the customer picked "no encuentro
--     mi zona" at checkout; the order is still created (delivery_fee = 0),
--     staff resolve the real fee from the dashboard afterwards. This is
--     deliberately a boolean flag, not a new `orders.status` value: the
--     existing status CHECK (scripts/001-create-schema.sql:49) and the
--     whole kanban derive from exactly 5 values
--     (new/paid/ready/completed/canceled) — an unresolved delivery fee is a
--     billing fact about the order, orthogonal to its kitchen/fulfillment
--     status. It is also deliberately NOT modeled as `delivery_fee IS NULL`:
--     lib/hooks/orders/use-update-order.ts recomputes
--     `total_amount = items - discount + delivery_fee + price_adjustment`,
--     and a NULL there propagates NaN into a customer's total — exactly the
--     class of bug scripts/018-app-settings.sql's header already documents
--     avoiding on purpose with typed, non-null columns.
--
-- BEFORE RUNNING ON PRODUCTION:
--
--   1. Must return ZERO rows — if it returns a row, the table already
--      exists, STOP and inspect it instead of running this:
--
--        SELECT tablename FROM pg_tables
--        WHERE schemaname = 'public' AND tablename = 'delivery_zones';
--
--   2. Must return ZERO rows — same reasoning as 010/016:
--      scripts/001-create-schema.sql is known to be out of date vs.
--      production, so this repo cannot verify the live `orders` schema on
--      its own.
--
--        SELECT column_name, data_type FROM information_schema.columns
--        WHERE table_schema = 'public'
--          AND table_name = 'orders'
--          AND column_name IN ('delivery_zone_id', 'delivery_zone_name', 'delivery_fee_pending');
--
--   3. ⚠️ `orders.delivery_fee` ITSELF was never created by a script in
--      this repo — like source/delivery_type/payment_method before it (see
--      the note in scripts/010-order-source.sql:22), it was added directly
--      in Supabase at some point before this repo started scripting DDL.
--      Every piece of code this change adds or touches (this repo's
--      use-update-order.ts total recomputation, jebbs-landing's
--      resolve-delivery-fee.ts and format-order-whatsapp.ts) assumes it is
--      `numeric, NOT NULL, DEFAULT 0` — run this and confirm before
--      proceeding:
--
--        SELECT data_type, is_nullable, column_default
--        FROM information_schema.columns
--        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'delivery_fee';
--
--      If `is_nullable` is `YES`, do NOT run this script yet — first run,
--      by hand, in a separate transaction:
--
--        UPDATE orders SET delivery_fee = 0 WHERE delivery_fee IS NULL;
--        ALTER TABLE orders ALTER COLUMN delivery_fee SET DEFAULT 0;
--        ALTER TABLE orders ALTER COLUMN delivery_fee SET NOT NULL;
--
--      If `data_type` is not a numeric type, STOP entirely and adjust the
--      application code first — this script does not attempt to fix that.
--
-- ADD COLUMN IF NOT EXISTS is deliberately NOT used for the same reason as
-- every other script here: it would silently succeed against a
-- pre-existing column of the wrong type, which is exactly the failure this
-- script needs to be loud about.
--
-- The script is wrapped in a transaction: if any statement fails, nothing
-- partially applies.
--
-- Undo, if ever needed:
--   ALTER TABLE orders DROP COLUMN delivery_zone_id;
--   ALTER TABLE orders DROP COLUMN delivery_zone_name;
--   ALTER TABLE orders DROP COLUMN delivery_fee_pending;
--   DROP TABLE delivery_zones;

BEGIN;

CREATE TABLE delivery_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  fee NUMERIC(10, 2) NOT NULL CHECK (fee >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  map_zone_key TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Prevents two ACTIVE zones from sharing a display name (a picker with two
-- rows that both say "La Plata" at different prices would be a support
-- nightmare). Partial index instead of a plain UNIQUE: a deactivated zone
-- keeps its name for order history, and its name becoming free again for a
-- future zone is desired, not a bug.
CREATE UNIQUE INDEX delivery_zones_name_active_uniq ON delivery_zones (lower(name)) WHERE is_active;

-- Real prices, confirmed by the owner. Villa Elisa has no `map_zone_key` --
-- public/delivery-zone-map.svg only has traced polygons for z1..z4 (City
-- Bell/Gonnet/Ringuelet/La Plata); Villa Elisa still works end to end
-- (picker, pricing, WhatsApp), it just isn't drawn/highlighted on the map
-- until someone traces a 5th polygon and this row's map_zone_key is set.
INSERT INTO delivery_zones (name, fee, sort_order, map_zone_key) VALUES
  ('City Bell', 2500, 10, 'z1'),
  ('Gonnet', 2500, 20, 'z2'),
  ('Ringuelet', 3500, 30, 'z3'),
  ('La Plata', 4500, 40, 'z4'),
  ('Villa Elisa', 4500, 50, NULL);

ALTER TABLE delivery_zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on delivery_zones" ON delivery_zones FOR ALL USING (true) WITH CHECK (true);

-- No ON DELETE clause -- defaults to NO ACTION, so deleting a zone that's
-- referenced by any order fails loudly instead of orphaning/cascading
-- through order history. Nullable: pickup orders, orders predating this
-- column, and "no encuentro mi zona" orders all have no zone.
ALTER TABLE orders ADD COLUMN delivery_zone_id UUID REFERENCES delivery_zones(id);

-- Denormalized snapshot, same convention as order_items.burger_name /
-- orders.customer_name -- renaming a zone later must not rewrite history.
ALTER TABLE orders ADD COLUMN delivery_zone_name TEXT;

-- NOT NULL DEFAULT false: every pre-existing row (and every pickup order
-- going forward) is correctly "not pending" without a backfill.
ALTER TABLE orders ADD COLUMN delivery_fee_pending BOOLEAN NOT NULL DEFAULT FALSE;

COMMIT;

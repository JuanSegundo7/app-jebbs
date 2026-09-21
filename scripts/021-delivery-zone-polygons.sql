-- Delivery zone polygons — owner-drawn zone shapes, on top of the fixed
-- Zona 1-4 system from scripts/019-delivery-zones.sql.
--
-- `map_zone_key` only ever let a zone occupy one of 4 pre-traced polygons
-- baked into public/delivery-zone-map.svg (`data-zone="z1".."z4"`) -- there
-- was no way to add a 5th shape (e.g. for "Villa Elisa", which has no
-- polygon at all today) or to correct one of the 4 existing shapes. This
-- migration adds `map_polygon`: an array of [x, y] point pairs in the same
-- coordinate space the SVG already uses (`viewBox="0 0 1654 966"`,
-- confirmed in public/delivery-zone-map.svg's root <svg> element), which
-- the dashboard's new polygon editor lets the owner draw/drag by hand.
--
-- Nullable, no default: a zone with neither `map_zone_key` nor
-- `map_polygon` set keeps behaving exactly as it does today (appears in
-- the zone list, isn't highlighted on the map). `map_zone_key` is NOT
-- touched or migrated by this script -- the 4 legacy zones keep rendering
-- via their existing pre-traced path exactly as before, until someone
-- redraws them by hand with the new tool. The app layer (not this script)
-- is responsible for clearing `map_zone_key` to null the moment a zone's
-- `map_polygon` is saved, so a zone never has two competing map
-- representations at once.
--
-- jsonb, not a dedicated points table: the shape is only ever read/written
-- whole (the editor saves the entire vertex list at once, nothing queries
-- "zones containing point X" today -- see this change's explicit
-- out-of-scope list, no address-to-zone matching), so a normalized table
-- would only add join overhead with no query it enables.
--
-- BEFORE RUNNING ON PRODUCTION: run these two checks first, in a separate
-- query, same reasoning as every prior script here (001-create-schema.sql
-- is known to be out of date vs. production).
--
--   -- (a) must return exactly ONE row:
--   SELECT tablename FROM pg_tables
--   WHERE schemaname = 'public' AND tablename = 'delivery_zones';
--
--   -- (b) must return ZERO rows:
--   SELECT column_name FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'delivery_zones' AND column_name = 'map_polygon';
--
-- If (a) returns zero rows, scripts/019-delivery-zones.sql was never
-- applied -- STOP. If (b) returns a row, the column already exists --
-- STOP and inspect it instead of running this.
--
-- ADD COLUMN IF NOT EXISTS is deliberately NOT used, same reasoning as
-- every other script here: it would silently succeed against a
-- pre-existing column of the wrong type.
--
-- The script is wrapped in a transaction: if any statement fails, nothing
-- partially applies.
--
-- Undo, if ever needed:
--   ALTER TABLE delivery_zones DROP COLUMN map_polygon;

BEGIN;

ALTER TABLE delivery_zones ADD COLUMN map_polygon JSONB;

COMMIT;

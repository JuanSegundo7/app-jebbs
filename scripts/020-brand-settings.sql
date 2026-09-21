-- Brand settings — primary accent color (light/dark) and logo, added to the
-- existing app_settings singleton (scripts/018-app-settings.sql).
--
-- `primary_color_light` defaults to '#f57c00' and `primary_color_dark` to
-- '#ff9f0a'. These are not placeholders — they are byte-for-byte the current
-- --accent-brand values in app/globals.css:43 (light theme) and
-- app/globals.css:155 (dark theme). Same principle 018 used for the
-- WhatsApp/delivery templates: day one, zero visual change for anyone who
-- never opens /configuracion. Only once a shop owner actually edits their
-- brand color does anything on screen move.
--
-- Why TWO stored colors instead of one: in this design system, light and
-- dark are not the same palette with a brightness knob turned up or down —
-- they are hand-tuned palettes chosen independently. globals.css says this
-- explicitly about --jebbs ("marca inmutable, nunca derivada", line 154),
-- the one color that's genuinely mode-invariant. --accent-brand is the
-- opposite case: #f57c00 in light, #ff9f0a in dark, different hex entirely —
-- and the values that key off it aren't a simple lighten/darken either
-- (--accent-contrast is #ffffff in light but #180d00, near-black, in dark;
-- --accent-hover darkens in light but lightens in dark, per the comment at
-- globals.css:156). A single stored color with a derived "other mode"
-- value would have to reinvent that hand-tuning with a formula. Storing
-- both lets the shop owner's choice replace both real values, one edit per
-- mode, same as the system already ships.
--
-- The other 5 accent tokens (--accent-hover, --accent-pressed,
-- --accent-contrast, --accent-tint-08/16/32) are deliberately NOT columns
-- here — they stay derived, computed client-side from whichever of these
-- two colors is active for the resolved theme. A future work unit adds
-- lib/utils/deriveAccentPalette.ts to do that derivation; this script only
-- stores the two inputs to it.
--
-- `logo_url` is nullable on purpose, same convention as the rest of this
-- table: NULL means "no custom logo, use the /jebbs.jpg already in the
-- bundle" — not an empty string, not a placeholder URL pointing at that
-- same bundled file. A future work unit adds the upload UI and the
-- fallback-to-bundle wiring in components/layout/sidebar.tsx and
-- components/auth/login-form.tsx; this script only adds the column.
--
-- Storage bucket `branding` (PUBLIC) — MANUAL STEP, NOT PART OF THIS SCRIPT:
--
--   Supabase Storage buckets are not created with table DDL — there is no
--   `CREATE BUCKET` statement, and this repo has no precedent for creating
--   one via SQL: grepping the repo for createBucket/storage.createBucket/
--   "CREATE BUCKET" turns up nothing, and the one bucket already in use,
--   `burger-images` (see lib/hooks/use-image-upload.ts), has no script
--   anywhere that created it either — it was made by hand from the
--   dashboard, same as this one needs to be.
--
--   ⚠️ BEFORE THE LOGO UPLOAD FEATURE CAN WORK, SOMEONE MUST CREATE THE
--   BUCKET BY HAND:
--     Supabase dashboard → Storage → New bucket → name it exactly
--     `branding` → toggle "Public bucket" ON → Create.
--   Kept separate from `burger-images` on purpose: these are brand assets
--   (logo), not product photos, and a shop should be able to list or clear
--   one without touching the other.
--
-- BEFORE RUNNING ON PRODUCTION: run this check first, in a separate query —
-- it must return ZERO rows. If it returns any row, one or more of these
-- columns already exist — STOP and inspect before running this.
--
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'app_settings'
--     AND column_name IN ('primary_color_light', 'primary_color_dark', 'logo_url');
--
-- ADD COLUMN IF NOT EXISTS is deliberately NOT used, same reasoning as every
-- other script here: it would silently succeed against a pre-existing
-- column of the wrong type, which is exactly the failure this script needs
-- to be loud about.
--
-- This work unit does not wire these columns into anything that renders —
-- it only adds them. Nothing in the running app changes behavior yet.
--
-- Undo, if ever needed:
--   ALTER TABLE app_settings DROP COLUMN primary_color_light;
--   ALTER TABLE app_settings DROP COLUMN primary_color_dark;
--   ALTER TABLE app_settings DROP COLUMN logo_url;

BEGIN;

ALTER TABLE app_settings
  ADD COLUMN primary_color_light text NOT NULL DEFAULT '#f57c00',
  ADD COLUMN primary_color_dark  text NOT NULL DEFAULT '#ff9f0a',
  ADD COLUMN logo_url text;

COMMIT;

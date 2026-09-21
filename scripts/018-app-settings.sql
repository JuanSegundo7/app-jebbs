-- App settings — business-wide configuration, singleton table
--
-- Today this configuration lives in localStorage, split across two separate
-- concerns that don't even agree on where they're read from:
--
--   - components/order-wizard/hooks/use-order-settings.ts reads
--     "jebbs_default_delivery_fee" and "jebbs_pedidosya_commission_pct"
--     straight out of localStorage to seed a new order.
--   - app/(dashboard)/precios/page.tsx writes those same two keys when the
--     user edits them.
--
-- localStorage is per-browser, per-device. The shop runs orders from more
-- than one device (counter tablet, phone, back office) — each one has its
-- own localStorage, so each one can silently drift to a different delivery
-- fee or PedidosYa commission rate with no way for staff to notice they've
-- diverged. A future work unit migrates both of the files above to read
-- from this table instead; this script only adds the table they'll read
-- from — it changes nothing about how those files behave today.
--
-- Singleton: `id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1)` instead of
-- a `uuid` row. There is exactly one shop and there will only ever be one
-- row — a uuid primary key would let a second row exist by accident (two
-- inserts, two ids) with no natural way to know which one the app is
-- supposed to read. The CHECK makes "there can only be one" a database
-- guarantee instead of an application convention: any INSERT with an id
-- other than 1 fails outright, and a second INSERT with id = 1 collides
-- with the primary key.
--
-- Typed columns instead of a single `jsonb` blob: every write into a jsonb
-- column is keyed by a string that Postgres can't validate against a
-- schema. A typo in a jsonb key (e.g. "defaultDeliveryFee" one day,
-- "default_delivery_fee" the next) doesn't error — it just silently
-- resolves to `undefined` wherever it's read, which is exactly the kind of
-- failure this repo already guards against by hand: see the
-- `Number.isFinite` checks in
-- components/order-wizard/hooks/use-order-settings.ts (guarding the exact
-- localStorage values this table replaces) that exist precisely because a
-- bad numeric value silently became NaN and propagated into an order's
-- total. Typed columns turn that class of bug into a column-does-not-exist
-- error at write time instead of a NaN in a customer's total at read time.
--
-- Deliberately NOT included as columns: the closing lines of the WhatsApp
-- message ("Gracias por tu compra 🙌", the "VERIFICAR QUE ESTÉ TODO
-- CORRECTO" warning) and every other piece of literal message text. Those
-- stay as plain text inside `whatsapp_template` / `delivery_template` — a
-- future work unit adds template editing, not per-line columns for every
-- sentence a template happens to contain today. `business_name` and
-- `pickup_address` are the only two exceptions, and only because both
-- templates repeat them (see the `{{negocio}}` and
-- `{{direccion_retiro}}` placeholders below) — a value used by more than
-- one template is shop configuration, not template prose.
--
-- Also deliberately NOT included: labels like "💵 Efectivo" or "Envío a
-- domicilio". Those aren't configuration — they're the output of an `if`
-- branch over `payment_method` / `delivery_type` on the order itself, fixed
-- code, not something a user edits per shop. They stay as constants in
-- code, same as today.
--
-- BEFORE RUNNING ON PRODUCTION:
--
--   1. Run this check first, in a separate query — it must return ZERO
--      rows. If it returns a row, the table already exists — STOP and
--      inspect it instead of running this.
--
--        SELECT tablename FROM pg_tables
--        WHERE schemaname = 'public' AND tablename = 'app_settings';
--
--   2. ⚠️ BEFORE INSERTING THE DEFAULT ROW BELOW, SOMEONE MUST OPEN THE
--      SHOP'S DASHBOARD IN A BROWSER AND READ THE LIVE LOCALSTORAGE VALUES
--      BY HAND: open devtools on the console and run
--      `localStorage.getItem("jebbs_default_delivery_fee")` and
--      `localStorage.getItem("jebbs_pedidosya_commission_pct")`. IF EITHER
--      VALUE DIFFERS FROM THE DEFAULTS BELOW (2000 AND 0), ADJUST THE
--      INSERT STATEMENT — OR RUN AN UPDATE RIGHT AFTER THIS SCRIPT —
--      BEFORE THIS TABLE BECOMES THE SOURCE OF TRUTH IN A FUTURE WORK
--      UNIT. IF THIS STEP IS SKIPPED, EVERY NEW ORDER WILL SILENTLY
--      QUOTE DELIVERY AT $2000 AND COMMISSION AT 0%, EVEN IF THE SHOP HAD
--      BEEN RUNNING WITH DIFFERENT VALUES FOR MONTHS.
--
-- This work unit does not migrate any reader/writer to this table — it
-- only creates it. Nothing in the running app changes behavior yet.
--
-- Undo, if ever needed:
--   DROP TABLE app_settings;

BEGIN;

CREATE TABLE app_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  business_name text NOT NULL DEFAULT 'JEBBS BURGERS',
  pickup_address text NOT NULL DEFAULT '479 n2539 e 20 y 21',
  -- Dollar-quoted so the single quotes, emojis and newlines in these
  -- templates don't need escaping. Placeholders like {{cliente}} are plain
  -- text at this stage — nothing resolves them yet; that's a future work
  -- unit. Keep this string byte-for-byte identical to
  -- lib/settings/defaults.ts's DEFAULT_APP_SETTINGS.whatsapp_template.
  whatsapp_template text NOT NULL DEFAULT $tpl$*{{negocio}}*
🧾 *PEDIDO #{{numero}}* · {{fecha}}

👤 *{{cliente}}* · {{metodo_pago}}
{{icono_entrega}} *{{tipo_entrega}}*
📍 {{direccion}}
   {{notas_direccion}}
🕐 {{etiqueta_hora}} a las: *{{hora_entrega}}*

📦 *Detalle*
{{items}}

💰 {{totales}}
*TOTAL: {{total}}*
━━━━━━━━━━━━━━━
📝 {{notas}}
Gracias por tu compra 🙌

*⚠️ POR FAVOR VERIFICAR QUE ESTÉ TODO CORRECTO EN LA ORDEN ⚠️*$tpl$,
  -- Same rule: keep byte-for-byte identical to
  -- lib/settings/defaults.ts's DEFAULT_APP_SETTINGS.delivery_template.
  delivery_template text NOT NULL DEFAULT $tpl$*{{negocio}}*
Nombre Del Cliente: {{cliente}}
📍 Retiro: {{direccion_retiro}}
📍 Entrega: {{entrega}}
💵 Pagar al local: $
💸 Cobrar al cliente: $
🛵 Envío: {{envio}}
🧭 Estado Del Pedido
📱 Tel cliente: {{telefono}}$tpl$,
  default_delivery_fee numeric(10,2) NOT NULL DEFAULT 2000,
  pedidosya_commission_pct numeric(5,2) NOT NULL DEFAULT 0,
  default_delivery_minutes integer NOT NULL DEFAULT 30,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO app_settings (id) VALUES (1);

-- Enable Row Level Security (public access for this restaurant dashboard,
-- same wide-open policy as every other table — single-tenant app, no
-- user_id/auth.uid scoping anywhere in this schema)
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on app_settings" ON app_settings FOR ALL USING (true) WITH CHECK (true);

COMMIT;

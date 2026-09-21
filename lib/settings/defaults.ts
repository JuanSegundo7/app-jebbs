// Espejo en TypeScript de los defaults sembrados por
// scripts/018-app-settings.sql — si cambiás uno, cambiá el otro.
//
// Usado como fallback cuando la query de settings no resolvió (loading,
// error, fila faltante) — ver lib/hooks/use-app-settings.ts.

import type { AppSettings } from "@/lib/types";

export const DEFAULT_APP_SETTINGS: AppSettings = {
  business_name: "JEBBS BURGERS",
  pickup_address: "479 n2539 e 20 y 21",
  whatsapp_template: `*{{negocio}}*
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

*⚠️ POR FAVOR VERIFICAR QUE ESTÉ TODO CORRECTO EN LA ORDEN ⚠️*`,
  delivery_template: `*{{negocio}}*
Nombre Del Cliente: {{cliente}}
📍 Retiro: {{direccion_retiro}}
📍 Entrega: {{entrega}}
💵 Pagar al local: $
💸 Cobrar al cliente: $
🛵 Envío: {{envio}}
🧭 Estado Del Pedido
📱 Tel cliente: {{telefono}}`,
  default_delivery_fee: 2000,
  pedidosya_commission_pct: 0,
  default_delivery_minutes: 30,
  // Byte-for-byte the current --accent-brand values in app/globals.css:43
  // (light) and :155 (dark) — see scripts/020-brand-settings.sql.
  primary_color_light: "#f57c00",
  primary_color_dark: "#ff9f0a",
  logo_url: null,
};

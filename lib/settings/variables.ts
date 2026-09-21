// Catálogo de variables disponibles para whatsapp_template / delivery_template
// (ver lib/settings/defaults.ts y scripts/018-app-settings.sql). Un futuro
// work unit lo usa para renderizar tooltips/autocomplete en el editor de
// plantillas y para resolver los placeholders {{var}} al armar el mensaje
// real de un pedido — acá solo se declara el catálogo, nada lo resuelve
// todavía.

export interface OrderMessageVar {
  name: string; // "cliente", sin las llaves
  label: string; // "Nombre del cliente"
  example: string; // valor de ejemplo para el tooltip
  multiline?: boolean; // true solo para items y totales
}

export const ORDER_MESSAGE_VARS: OrderMessageVar[] = [
  { name: "negocio", label: "Nombre del negocio", example: "JEBBS BURGERS" },
  { name: "numero", label: "Número de pedido", example: "1042" },
  { name: "fecha", label: "Fecha y hora del pedido", example: "20/09/2026 14:30" },
  { name: "cliente", label: "Nombre del cliente", example: "Juan Pérez" },
  { name: "telefono", label: "Teléfono del cliente", example: "+54 9 11 1234-5678" },
  { name: "metodo_pago", label: "Método de pago", example: "💵 Efectivo" },
  { name: "icono_entrega", label: "Ícono de entrega", example: "🚚" },
  { name: "tipo_entrega", label: "Tipo de entrega", example: "Envío a domicilio" },
  { name: "direccion", label: "Dirección de entrega", example: "Av. Siempreviva 742" },
  { name: "notas_direccion", label: "Notas de la dirección", example: "Timbre roto, tocar bocina" },
  { name: "etiqueta_hora", label: "Etiqueta de hora (Entregar/Retirar)", example: "Entregar" },
  { name: "hora_entrega", label: "Hora de entrega o retiro", example: "15:00" },
  { name: "entrega", label: "Dirección de entrega o 'Retira en local'", example: "Av. Siempreviva 742" },
  { name: "direccion_retiro", label: "Dirección de retiro del local", example: "479 n2539 e 20 y 21" },
  { name: "envio", label: "Costo de envío", example: "$ 2.000" },
  { name: "total", label: "Total del pedido", example: "$ 12.500" },
  { name: "notas", label: "Notas del pedido", example: "Sin cebolla en todas" },
  { name: "linea_subtotal", label: "Línea de subtotal", example: "Subtotal $ 10.000" },
  { name: "linea_envio", label: "Línea de envío (se oculta si es $0)", example: "Envío $ 2.000" },
  { name: "linea_descuento", label: "Línea de descuento (se oculta si no hay)", example: "Desc. 10% -$ 1.200" },
  { name: "linea_ajuste", label: "Línea de ajuste PedidosYa (se oculta si no hay)", example: "Ajuste PedidosYa +$ 500" },
  { name: "items", label: "Detalle de items del pedido", example: "• 2x Hamburguesa Clásica — $ 8.000", multiline: true },
  { name: "totales", label: "Totales combinados (subtotal · envío · descuento · ajuste)", example: "Subtotal $ 10.000 · Envío $ 2.000", multiline: true },
];

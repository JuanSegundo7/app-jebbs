// Fixture fijo (no el último pedido real) usado únicamente por el preview
// en vivo de /configuracion. Un pedido real casi nunca ejercita todas las
// ramas condicionales de buildOrderMessageVars (formatOrderWhatsapp.ts) a la
// vez — este SAMPLE_ORDER sí, deterministamente, para que el usuario vea
// cómo se ve CADA sección de su plantilla mientras la edita:
//
// - delivery con dirección (address + notes) y hora de entrega
// - una burger individual: sin papas (con descuento), ingredientes
//   removidos y un extra vía customData.extras
// - un combo: slot de burger (con sus propias customizations) + slot de
//   bebida vía selectedExtras
// - un side suelto (extra_id) con un order_item_extras de subtotal > 0
// - descuento porcentual, ajuste de PedidosYa y envío, todos > 0
//
// Las notas del pedido y las notas de la dirección son A PROPÓSITO textos
// distintos, para detectar si algún cambio futuro los confunde.
import type { OrderForMessage } from "@/lib/utils/formatOrderWhatsapp";

export const SAMPLE_ORDER: OrderForMessage = {
  order_number: 1042,
  // Fecha fija, no new Date(): este archivo es un fixture DETERMINISTA a
  // propósito (ver comentario de arriba) -- new Date() era la única parte
  // que no lo era, y al evaluarse una vez en el server (SSR) y otra vez en
  // el cliente (hidratación), en momentos distintos, producía un
  // "Hydration failed" real cada vez que se abría /configuracion.
  created_at: "2024-06-15T15:00:00.000Z",
  customer_name: "Juan Pérez",
  customer: {
    phone: "+54 9 11 1234-5678",
    customer_addresses: [
      {
        id: "addr-1",
        address: "Av. Siempreviva 742",
        notes: "Portón verde, tocar timbre 2 veces",
      },
    ],
  },
  customer_address_id: "addr-1",
  delivery_type: "delivery",
  delivery_fee: 2000,
  payment_method: "transfer",
  delivery_time: "15:00",
  discount_type: "percentage",
  discount_value: 10,
  discount_amount: 1850,
  price_adjustment: 500,
  total_amount: 19150,
  notes: "Timbre roto, tocar bocina",
  order_items: [
    // Burger individual: sin papas (con descuento), ingredientes
    // removidos y un extra vía customData.extras.
    {
      quantity: 1,
      burger_name: "Hamburguesa Clásica",
      unit_price: 6000,
      subtotal: 6000,
      customizations: JSON.stringify({
        friesQuantity: 0,
        friesAdjustment: -500,
        removedIngredients: ["Cebolla", "Pepino"],
        extras: [{ name: "Queso Cheddar", quantity: 1, price: 800 }],
      }),
      extra_id: null,
      order_item_extras: null,
    },
    // Combo: customizations es un ARRAY de slots (isCombo se detecta con
    // Array.isArray). Un slot de burger + un slot de bebida.
    {
      quantity: 1,
      burger_name: "Combo Doble",
      unit_price: 9000,
      subtotal: 9000,
      customizations: JSON.stringify([
        {
          burgers: [
            {
              name: "Hamburguesa Bacon",
              quantity: 1,
              meatCount: 2,
              isVeggie: false,
              friesQuantity: 1,
              friesAdjustment: 0,
              removedIngredients: ["Tomate"],
              extras: [{ name: "Bacon extra", quantity: 1, price: 600 }],
            },
          ],
        },
        {
          slotType: "drink",
          selectedExtras: [{ name: "Coca-Cola" }],
        },
      ]),
      extra_id: null,
      order_item_extras: null,
    },
    // Side suelto: extra_id seteado (no null) + order_item_extras con un
    // extra de subtotal > 0.
    {
      quantity: 2,
      burger_name: "Papas Fritas Grandes",
      unit_price: 1500,
      subtotal: 3000,
      customizations: null,
      extra_id: "extra-fries-large",
      order_item_extras: [{ extra_name: "Cheddar extra", quantity: 1, subtotal: 500 }],
    },
  ],
};

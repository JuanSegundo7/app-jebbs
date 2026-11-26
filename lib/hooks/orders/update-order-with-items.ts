import type { createClient } from "@/lib/supabase/client";

// Derived from the app factory so it matches the exact supabase-js instance in use.
type SupabaseClient = ReturnType<typeof createClient>;
import type { OrderItemInput } from "./use-create-order";
import type { OrderSource } from "@/lib/types";

export interface UpdateOrderPayload {
  customer_id: string | null;
  customer_name: string;
  customer_address_id: string | null;
  delivery_type: "delivery" | "pickup";
  delivery_fee: number;
  payment_method: "cash" | "transfer";
  source?: OrderSource | null;
  commission_rate?: number | null;
  discount_type: "amount" | "percentage" | "none" | null;
  discount_value: number;
  discount_percentage?: number;
  discount_fixed?: number;
  discount_amount: number;
  price_adjustment?: number;
  items: OrderItemInput[];
  notes: string | null;
  delivery_time?: string | null;
}

/**
 * Best-effort cleanup of rows inserted by this update. Failures are logged
 * and swallowed so they never mask the error that triggered the cleanup.
 */
async function removeInsertedRows(
  supabase: SupabaseClient,
  newItemIds: string[],
) {
  if (newItemIds.length === 0) return;
  try {
    const { error: extrasErr } = await supabase
      .from("order_item_extras")
      .delete()
      .in("order_item_id", newItemIds);
    if (extrasErr) console.error("Compensation (extras) failed:", extrasErr);
  } catch (e) {
    console.error("Compensation (extras) threw:", e);
  }
  try {
    const { error: itemsErr } = await supabase
      .from("order_items")
      .delete()
      .in("id", newItemIds);
    if (itemsErr) console.error("Compensation (items) failed:", itemsErr);
  } catch (e) {
    console.error("Compensation (items) threw:", e);
  }
}

/**
 * Replaces an order's items without ever leaving it item-less: the new rows
 * are inserted and the order row updated FIRST; the old rows are deleted only
 * as the very last step, once nothing else can fail.
 */
export async function updateOrderWithItems(
  supabase: SupabaseClient,
  orderId: string,
  payload: UpdateOrderPayload,
) {
  // a) Remember the old items (they are deleted last, by id).
  const { data: oldItems, error: oldItemsError } = await supabase
    .from("order_items")
    .select("id")
    .eq("order_id", orderId);

  if (oldItemsError) throw oldItemsError;
  const oldItemIds: string[] = (oldItems ?? []).map((item: any) => item.id);

  // Calculate new total
  const totalAmount = payload.items.reduce((sum, item) => {
    const extrasTotal = item.extras.reduce(
      (extSum, ext) => extSum + ext.subtotal,
      0,
    );
    return sum + item.subtotal + extrasTotal;
  }, 0);

  const finalTotal =
    totalAmount -
    payload.discount_amount +
    payload.delivery_fee +
    (payload.price_adjustment ?? 0);

  // Same frozen-commission logic as use-create-order.ts: recomputed
  // from the current total, but at the ORIGINAL rate the order was
  // created with (payload.commission_rate, resolved by the caller from
  // the order's own commission_rate via order-data-loader.ts — never
  // from today's live % in localStorage). Editing an order can change
  // its items/total, so the amount must be redone, but the rate itself
  // must never drift just because someone edited an old order.
  const commissionAmount =
    payload.source === "pedidosya" && payload.commission_rate
      ? Math.round(finalTotal * (payload.commission_rate / 100) * 100) / 100
      : 0;

  // b) Insert the new order_items (nothing has changed yet if this fails).
  const itemsToInsert = payload.items.map((item) => ({
    order_id: orderId,
    burger_id: item.burger_id,
    combo_id: item.combo_id ?? null,
    extra_id: item.extra_id ?? null,
    burger_name: item.burger_name,
    quantity: item.quantity,
    unit_price: item.unit_price,
    subtotal: item.subtotal,
    customizations: item.customizations ?? null,
  }));

  const { data: insertedItems, error: itemsError } = await supabase
    .from("order_items")
    .insert(itemsToInsert)
    .select();

  if (itemsError) throw itemsError;

  const newItemIds: string[] = (insertedItems ?? []).map((i: any) => i.id);

  // c) Insert the new order_item_extras.
  const extrasToInsert: any[] = [];

  payload.items.forEach((item, index) => {
    const orderItemId = insertedItems?.[index]?.id;
    if (!orderItemId) return;

    item.extras.forEach((extra) => {
      extrasToInsert.push({
        order_item_id: orderItemId,
        extra_id: extra.extra_id,
        extra_name: extra.extra_name,
        quantity: extra.quantity,
        unit_price: extra.unit_price,
        subtotal: extra.subtotal,
      });
    });
  });

  if (extrasToInsert.length > 0) {
    const { error: extrasError } = await supabase
      .from("order_item_extras")
      .insert(extrasToInsert);

    if (extrasError) {
      await removeInsertedRows(supabase, newItemIds);
      throw extrasError;
    }
  }

  // d) Update the order row.
  const { data: updatedOrder, error: orderError } = await supabase
    .from("orders")
    .update({
      customer_id: payload.customer_id,
      customer_name: payload.customer_name,
      customer_address_id: payload.customer_address_id,
      delivery_type: payload.delivery_type,
      delivery_fee: payload.delivery_fee,
      payment_method: payload.payment_method,
      source: payload.source ?? null,
      commission_amount: commissionAmount,
      commission_rate: payload.commission_rate ?? null,
      delivery_time: payload.delivery_time ?? null,
      discount_type: payload.discount_type,
      discount_value: payload.discount_value,
      discount_percentage: payload.discount_percentage ?? 0,
      discount_fixed: payload.discount_fixed ?? 0,
      discount_amount: payload.discount_amount,
      price_adjustment: payload.price_adjustment ?? 0,
      total_amount: finalTotal,
      notes: payload.notes,
      // Editar el pedido completo (este path) siempre implica que
      // alguien del local miró y confirmó el costo de envío -- nunca
      // queda "a confirmar" después de pasar por acá, sin importar el
      // valor que tuviera antes.
      delivery_fee_pending: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .select()
    .single();

  if (orderError) {
    await removeInsertedRows(supabase, newItemIds);
    throw orderError;
  }

  // e) Everything succeeded: only now remove the OLD rows, by id (never by
  // order_id, which would also delete the new ones). A single statement:
  // order_item_extras is removed by ON DELETE CASCADE, so a failure here can
  // never leave old items stripped of their extras.
  if (oldItemIds.length > 0) {
    const { error: oldItemsDeleteError } = await supabase
      .from("order_items")
      .delete()
      .in("id", oldItemIds);

    if (oldItemsDeleteError) {
      throw new Error(
        "The order was saved, but the old items could not be removed; " +
          "the order may contain duplicated items and needs manual review. " +
          `Cause: ${oldItemsDeleteError.message}`,
      );
    }
  }

  // f)
  return updatedOrder;
}

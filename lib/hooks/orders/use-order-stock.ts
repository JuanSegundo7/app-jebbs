import { createClient } from "@/lib/supabase/client";
import type { OrderStatus, RecipeScaling } from "@/lib/types";
import {
  collectRecipeTargets,
  resolveOrderConsumption,
  round3,
  type ConsumptionOrderItem,
  type ConsumptionRecipeLine,
  type RecipeBook,
} from "@/lib/utils/stock-consumption";

// Client-side, sequential, no transaction — same convention as every other
// mutation in this codebase (there is no RPC anywhere in this repo). Same
// accepted risk as useCreateExpense/useCreateOrder: a failure mid-loop
// leaves some supplies already updated. See the loop comments below for how
// each direction is deliberately biased toward the safer failure mode.

// Thrown when deduction fails partway through. Same shape as
// use-expenses.ts's StockUpdateError/StockRevertError: readonly fields, a
// human-readable message via super(), `this.name` set for logging/matching.
export class OrderStockDeductionError extends Error {
  readonly orderId: string;
  readonly cause: unknown;

  constructor(orderId: string, cause: unknown) {
    super(`Failed to deduct stock for order ${orderId}`);
    this.name = "OrderStockDeductionError";
    this.orderId = orderId;
    this.cause = cause;
  }
}

export function isOrderStockDeductionFailure(error: unknown): error is OrderStockDeductionError {
  return error instanceof OrderStockDeductionError;
}

// Thrown when reversal fails partway through. Mirrors OrderStockDeductionError.
export class OrderStockReversalError extends Error {
  readonly orderId: string;
  readonly cause: unknown;

  constructor(orderId: string, cause: unknown) {
    super(`Failed to reverse stock deduction for order ${orderId}`);
    this.name = "OrderStockReversalError";
    this.orderId = orderId;
    this.cause = cause;
  }
}

export function isOrderStockReversalFailure(error: unknown): error is OrderStockReversalError {
  return error instanceof OrderStockReversalError;
}

export interface OrderStockResult {
  suppliesAffected: number;
  itemsWithoutRecipe: number;
  malformedComboItems: number;
  // true when there was nothing to do: already fully deducted (a
  // completed -> completed no-op write) for applyOrderStockDeduction, or
  // nothing recorded to reverse for reverseOrderStockDeduction.
  skipped: boolean;
}

type SupabaseClient = ReturnType<typeof createClient>;

// Raw shape of a single order_items row as returned by the embedded select
// below. The `burgers`/`order_item_extras` embeds may come back as an
// object or an array depending on how Supabase infers the relationship —
// same defensive cast precedent as useProductStats in use-orders-history.ts.
interface RawOrderItemRow {
  quantity: number;
  burger_id: string | null;
  combo_id: string | null;
  extra_id: string | null;
  customizations: string | null;
  burgers: { default_meat_quantity: number; default_fries_quantity: number } | null;
  order_item_extras: { extra_id: string; quantity: number }[] | null;
}

// Not exported — internal fetch step shared by apply/reverse. Two query
// waves: (1) order_items with everything needed to know what was sold, in
// one embedded select (mirrors useProductStats's query shape); (2) up to two
// parallel queries for the burger/extra recipes actually referenced,
// skipping either one when its id list is empty (an empty .in(...) is a
// wasted round-trip, and Supabase can error on it).
async function fetchOrderConsumptionInputs(
  supabase: SupabaseClient,
  orderId: string
): Promise<{ items: ConsumptionOrderItem[]; book: RecipeBook }> {
  const { data: rawItems, error: itemsError } = await supabase
    .from("order_items")
    .select(
      "quantity, burger_id, combo_id, extra_id, customizations, " +
        "burgers(default_meat_quantity, default_fries_quantity), " +
        "order_item_extras(extra_id, quantity)"
    )
    .eq("order_id", orderId);

  if (itemsError) throw itemsError;

  const items: ConsumptionOrderItem[] = ((rawItems ?? []) as unknown as RawOrderItemRow[]).map(
    (row) => {
      const burger = row.burgers as unknown as
        | { default_meat_quantity: number; default_fries_quantity: number }
        | { default_meat_quantity: number; default_fries_quantity: number }[]
        | null;
      const burgerDefaults = Array.isArray(burger) ? burger[0] ?? null : burger;

      const attachedExtras =
        (row.order_item_extras as unknown as { extra_id: string; quantity: number }[] | null) ?? [];

      return {
        quantity: row.quantity,
        burger_id: row.burger_id,
        combo_id: row.combo_id,
        extra_id: row.extra_id,
        customizations: row.customizations,
        burgerDefaults: burgerDefaults
          ? { meat: burgerDefaults.default_meat_quantity, fries: burgerDefaults.default_fries_quantity }
          : null,
        attachedExtras,
      };
    }
  );

  const { burgerIds, extraIds } = collectRecipeTargets(items);

  const [burgerSuppliesResult, extraSuppliesResult] = await Promise.all([
    burgerIds.length > 0
      ? supabase
          .from("burger_supplies")
          .select(
            "burger_id, supply_id, quantity, scales_with, burgers(default_meat_quantity, default_fries_quantity)"
          )
          .in("burger_id", burgerIds)
      : Promise.resolve({ data: [] as unknown[], error: null }),
    extraIds.length > 0
      ? supabase.from("extra_supplies").select("extra_id, supply_id, quantity").in("extra_id", extraIds)
      : Promise.resolve({ data: [] as unknown[], error: null }),
  ]);

  if (burgerSuppliesResult.error) throw burgerSuppliesResult.error;
  if (extraSuppliesResult.error) throw extraSuppliesResult.error;

  const burgerRecipes = new Map<string, ConsumptionRecipeLine[]>();
  const burgerDefaults = new Map<string, { meat: number; fries: number }>();

  interface RawBurgerSupplyRow {
    burger_id: string;
    supply_id: string;
    quantity: number;
    scales_with: RecipeScaling | null;
    burgers:
      | { default_meat_quantity: number; default_fries_quantity: number }
      | { default_meat_quantity: number; default_fries_quantity: number }[]
      | null;
  }

  for (const row of (burgerSuppliesResult.data ?? []) as unknown as RawBurgerSupplyRow[]) {
    const list = burgerRecipes.get(row.burger_id) ?? [];
    list.push({ supply_id: row.supply_id, quantity: row.quantity, scales_with: row.scales_with });
    burgerRecipes.set(row.burger_id, list);

    if (!burgerDefaults.has(row.burger_id)) {
      const defaults = Array.isArray(row.burgers) ? row.burgers[0] ?? null : row.burgers;
      if (defaults) {
        burgerDefaults.set(row.burger_id, {
          meat: defaults.default_meat_quantity,
          fries: defaults.default_fries_quantity,
        });
      }
    }
  }

  const extraRecipes = new Map<string, ConsumptionRecipeLine[]>();
  interface RawExtraSupplyRow {
    extra_id: string;
    supply_id: string;
    quantity: number;
  }
  for (const row of (extraSuppliesResult.data ?? []) as unknown as RawExtraSupplyRow[]) {
    const list = extraRecipes.get(row.extra_id) ?? [];
    list.push({ supply_id: row.supply_id, quantity: row.quantity });
    extraRecipes.set(row.extra_id, list);
  }

  return { items, book: { burgerRecipes, extraRecipes, burgerDefaults } };
}

// Deducts the stock consumed by a completed order. Idempotent PER SUPPLY,
// not per order: reads order_stock_movements for this order first, and only
// processes supplies not already recorded there. This means an order that
// failed halfway through a previous attempt finishes itself on the next
// call, instead of being stuck at whatever fraction succeeded.
//
// Per pending supply, in this exact order — deduct first, record second:
//   (a) UPDATE supplies SET stock_quantity = stock - qty
//   (b) INSERT the row into order_stock_movements
// If the process dies between (a) and (b) for one supply, the retry
// deducts that supply a second time (double-counted once) — the accepted
// tradeoff, since the alternative (record first, deduct second) would let
// the ledger claim a deduction that never actually happened, which would
// then falsely inflate stock on reversal. Both directions of this function
// fail toward "stock reads lower than the truth", never higher.
//
// No floor at zero anywhere: negative stock is a legal value (Phase 1's
// Math.max removal) and this function must not reintroduce one.
export async function applyOrderStockDeduction(orderId: string): Promise<OrderStockResult> {
  const supabase = createClient();

  try {
    const { data: existingMovements, error: movementsError } = await supabase
      .from("order_stock_movements")
      .select("supply_id")
      .eq("order_id", orderId);

    if (movementsError) throw movementsError;

    const alreadyRecorded = new Set((existingMovements ?? []).map((row) => row.supply_id as string));

    const { items, book } = await fetchOrderConsumptionInputs(supabase, orderId);
    const { consumption, itemsWithoutRecipe, malformedComboItems } = resolveOrderConsumption(
      items,
      book
    );

    const pending = new Map(
      [...consumption].filter(([supplyId]) => !alreadyRecorded.has(supplyId))
    );

    if (pending.size === 0) {
      return { suppliesAffected: 0, itemsWithoutRecipe, malformedComboItems, skipped: true };
    }

    const { data: supplyRows, error: suppliesError } = await supabase
      .from("supplies")
      .select("id, stock_quantity")
      .in("id", [...pending.keys()]);

    if (suppliesError) throw suppliesError;

    const currentStock = new Map(
      (supplyRows ?? []).map((row) => [row.id as string, Number(row.stock_quantity)])
    );

    for (const [supplyId, qty] of pending) {
      const current = currentStock.get(supplyId) ?? 0;

      const { error: updateError } = await supabase
        .from("supplies")
        .update({ stock_quantity: round3(current - qty) })
        .eq("id", supplyId);
      if (updateError) throw updateError;

      const { error: insertError } = await supabase
        .from("order_stock_movements")
        .insert({ order_id: orderId, supply_id: supplyId, quantity: qty });
      if (insertError) throw insertError;
    }

    return { suppliesAffected: pending.size, itemsWithoutRecipe, malformedComboItems, skipped: false };
  } catch (error) {
    // Whatever succeeded before the throw (some supplies already
    // decremented + ledgered) stays committed — no rollback of prior
    // iterations. That's the intended self-healing-on-retry property: the
    // idempotency guard above means the next call only reprocesses what's
    // still pending.
    throw new OrderStockDeductionError(orderId, error);
  }
}

// Reverses a previously-applied deduction. Reads order_stock_movements for
// this order — an empty result IS the entire "is there anything to
// reverse?" check, no need to read the order's previous status anywhere.
//
// Per row, in this exact order — the mirror image of deduction, delete then
// add:
//   (a) DELETE the row from order_stock_movements
//   (b) UPDATE supplies SET stock_quantity = stock + qty
// Same pessimistic-toward-low-stock bias as applyOrderStockDeduction: if the
// process dies between (a) and (b), the ledger row is already gone, so a
// retry would treat that supply as never-deducted and skip it — the stock
// stays under-credited rather than the ledger claiming a reversal that
// never happened.
export async function reverseOrderStockDeduction(orderId: string): Promise<OrderStockResult> {
  const supabase = createClient();

  try {
    const { data: movements, error: movementsError } = await supabase
      .from("order_stock_movements")
      .select("id, supply_id, quantity")
      .eq("order_id", orderId);

    if (movementsError) throw movementsError;

    if (!movements || movements.length === 0) {
      return { suppliesAffected: 0, itemsWithoutRecipe: 0, malformedComboItems: 0, skipped: true };
    }

    const { data: supplyRows, error: suppliesError } = await supabase
      .from("supplies")
      .select("id, stock_quantity")
      .in(
        "id",
        movements.map((m) => m.supply_id)
      );

    if (suppliesError) throw suppliesError;

    const currentStock = new Map(
      (supplyRows ?? []).map((row) => [row.id as string, Number(row.stock_quantity)])
    );

    for (const movement of movements) {
      const { error: deleteError } = await supabase
        .from("order_stock_movements")
        .delete()
        .eq("id", movement.id);
      if (deleteError) throw deleteError;

      // Tolerant read, mirroring use-expenses.ts's maybeSingle() handling:
      // the supply may be missing (ON DELETE RESTRICT should prevent this
      // in practice, but it's cheap defensive consistency with the existing
      // convention) — skip the stock update for that one entry, the ledger
      // row is still deleted either way.
      const current = currentStock.get(movement.supply_id);
      if (current === undefined) continue;

      const { error: updateError } = await supabase
        .from("supplies")
        .update({ stock_quantity: round3(current + Number(movement.quantity)) })
        .eq("id", movement.supply_id);
      if (updateError) throw updateError;
    }

    return {
      suppliesAffected: movements.length,
      itemsWithoutRecipe: 0,
      malformedComboItems: 0,
      skipped: false,
    };
  } catch (error) {
    throw new OrderStockReversalError(orderId, error);
  }
}

// Single entry point for both directions: `completed` deducts, anything
// else reverses. No previous-status lookup needed anywhere — see the
// module-level comments on applyOrderStockDeduction/reverseOrderStockDeduction
// for why the ledger alone is a sufficient idempotency source of truth.
export async function syncOrderStockForStatus(
  orderId: string,
  nextStatus: OrderStatus
): Promise<OrderStockResult> {
  return nextStatus === "completed"
    ? applyOrderStockDeduction(orderId)
    : reverseOrderStockDeduction(orderId);
}

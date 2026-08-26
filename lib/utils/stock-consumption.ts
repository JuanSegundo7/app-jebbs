// Pure stock-consumption math — no Supabase, no React. Mirrors costing.ts's
// own framing: this file resolves WHAT an order's items actually consumed
// from the supply catalog, given the order's items and the recipes already
// fetched for them. It never talks to the network itself — that's
// lib/hooks/orders/use-order-stock.ts's job, which fetches the inputs this
// file needs and applies the resulting deltas to `supplies.stock_quantity`.
//
// This is the resolution half of "deduct stock on order completion": given
// an order's `order_items` (in the four physical shapes the wizard can
// produce — see components/order-wizard/services/order-data-transformer.ts)
// plus the recipes for every burger/extra referenced, it produces one
// Map<supply_id, quantity> of total consumption. The Supabase-facing layer
// then subtracts (on completion) or adds back (on reversal) exactly that.

import type { RecipeScaling } from "@/lib/types";
import { makeScalingContext, resolveRecipeQuantities, type RecipeScalingContext } from "./costing";

// ─── Inputs ─────────────────────────────────────────────────────────────────

// The structural minimum a recipe line needs for consumption math — same
// spirit as RecipeLineWithDetails in lib/types, but without the joined
// `supply` object (this file never needs the supply's name/cost, only its
// id and how much of it a line consumes).
export interface ConsumptionRecipeLine {
  supply_id: string;
  quantity: number;
  scales_with?: RecipeScaling | null;
}

// One order_items row, reshaped for consumption resolution. `burgerDefaults`
// comes from the embedded `burgers(default_meat_quantity,
// default_fries_quantity)` select — null when burger_id is null OR the
// burger was deleted from the menu after the order was placed (a real,
// documented case — see useProductStats in use-orders-history.ts).
export interface ConsumptionOrderItem {
  quantity: number;
  burger_id: string | null;
  combo_id: string | null;
  extra_id: string | null;
  customizations: string | null; // raw JSON string, or null
  burgerDefaults: { meat: number | null; fries: number | null } | null;
  attachedExtras: { extra_id: string; quantity: number }[];
}

// Every recipe this order's items could possibly reference, pre-fetched by
// the caller. `burgerDefaults` here is keyed by burger_id and used to
// resolve a combo-slot burger's fallback configuration (when its own
// meatCount/friesQuantity is missing/garbage) — sourced from
// burger_supplies' embedded burgers(...) join in use-order-stock.ts, at
// zero extra round-trips.
export interface RecipeBook {
  burgerRecipes: Map<string, ConsumptionRecipeLine[]>;
  extraRecipes: Map<string, ConsumptionRecipeLine[]>;
  burgerDefaults: Map<string, { meat: number; fries: number }>;
}

// ─── Output ─────────────────────────────────────────────────────────────────

export interface OrderConsumption {
  // supply_id -> total quantity consumed, rounded to 3 decimals. Entries
  // that round to exactly 0, or are non-finite, are dropped — never
  // returned as a 0 or NaN entry.
  consumption: Map<string, number>;
  // Count of distinct burger/extra references that resolved to zero recipe
  // lines, including an order_item whose burger_id/combo_id/extra_id are
  // all null (the menu item was deleted after the order was placed).
  itemsWithoutRecipe: number;
  // Count of combo order_items whose `customizations` failed to JSON.parse.
  malformedComboItems: number;
}

// Rounds to 3 decimals, matching the DECIMAL(10,3) columns on both
// `supplies.stock_quantity` and `order_stock_movements.quantity`. Exported
// so use-order-stock.ts can reuse the exact same rounding when it recomputes
// stock_quantity after a read-then-write, instead of drifting from this
// file's own rounding by even a hair of floating point error.
export function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

// ─── Combo customizations shape ────────────────────────────────────────────
// Matches the exact JSON written by
// OrderDataTransformer.transformCombosToOrderItems: an ARRAY of slot
// objects. Only the fields consumption math actually reads are declared.

interface ComboSlotBurgerExtra {
  id: string; // the extra's id — note the field is `id`, not `extra_id`, on this shape
  quantity: number;
}

interface ComboSlotBurger {
  burgerId: string;
  meatCount: number;
  friesQuantity: number;
  quantity: number;
  extras: ComboSlotBurgerExtra[];
}

interface ComboSlotSelectedExtra {
  id: string; // no quantity field — one array entry = one unit chosen
}

interface ComboSlot {
  slotType: "burger" | "drink" | "side" | "nuggets";
  burgers: ComboSlotBurger[];
  selectedExtras: ComboSlotSelectedExtra[];
}

// Returns null on a null input or any parse failure — mirrors the
// try/JSON.parse/catch-skip precedent already established in
// useProductStats (use-orders-history.ts). Shared by both exported
// functions below; each does its own parse pass over combo customizations
// (yes, that means combo JSON is parsed twice across the two functions when
// both are called — that's intentional and cheap relative to a network
// round-trip, and it keeps collectRecipeTargets usable standalone before
// any recipe data exists).
function parseComboSlots(raw: string | null): ComboSlot[] | null {
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as ComboSlot[];
  } catch {
    return null;
  }
}

// A burger line's own customizations JSON is a plain object (meatCount,
// friesQuantity, ...), not the combo array above — separate shape, parsed
// separately in resolveOrderConsumption.
interface BurgerLineCustomizations {
  meatCount?: unknown;
  friesQuantity?: unknown;
}

// ─── collectRecipeTargets ───────────────────────────────────────────────────

// Walks every item and collects every burger_id/extra_id it could possibly
// need a recipe for, deduplicated. Used up front by use-order-stock.ts to
// build the .in(...) filters for the burger_supplies/extra_supplies fetch,
// before any recipe data exists — so malformed combo JSON here simply means
// fewer ids collected for that item, never a counted error (that's
// resolveOrderConsumption's job, on its own separate parse pass).
export function collectRecipeTargets(
  items: ConsumptionOrderItem[]
): { burgerIds: string[]; extraIds: string[] } {
  const burgerIds = new Set<string>();
  const extraIds = new Set<string>();

  for (const item of items) {
    if (item.burger_id) burgerIds.add(item.burger_id);
    if (item.extra_id) extraIds.add(item.extra_id);
    for (const ext of item.attachedExtras) {
      extraIds.add(ext.extra_id);
    }

    if (item.combo_id) {
      const slots = parseComboSlots(item.customizations);
      if (!slots) continue;
      for (const slot of slots) {
        if (slot.slotType === "burger") {
          for (const b of slot.burgers ?? []) {
            if (b.burgerId) burgerIds.add(b.burgerId);
            for (const ext of b.extras ?? []) {
              if (ext.id) extraIds.add(ext.id);
            }
          }
        } else {
          for (const e of slot.selectedExtras ?? []) {
            if (e.id) extraIds.add(e.id);
          }
        }
      }
    }
  }

  return { burgerIds: [...burgerIds], extraIds: [...extraIds] };
}

// ─── resolveOrderConsumption ────────────────────────────────────────────────

// The core resolution. Walks every item and accumulates supply consumption
// per this table (validated against the real order/menu data model):
//
// | Shape                                   | Recipe source              | Scaling context                          | Multiplier                          |
// |------------------------------------------|-----------------------------|-------------------------------------------|--------------------------------------|
// | Burger line                               | burgerRecipes[burger_id]    | own meatCount/friesQuantity (fallback: burger defaults) | x item.quantity        |
// | Combo slot burger                         | burgerRecipes[burgerId]     | own meatCount/friesQuantity (fallback: burgerDefaults)  | x b.quantity x item.quantity |
// | Combo slot burger's own topping           | extraRecipes[ext.id]        | n/a (extras never scale)                  | x ext.quantity x b.quantity x item.quantity |
// | Combo non-burger slot pick                | extraRecipes[e.id]          | n/a                                        | x item.quantity (one entry = one unit) |
// | Standalone extra/side line                | extraRecipes[extra_id]      | n/a                                        | x item.quantity                     |
// | Attached extra (order_item_extras)        | extraRecipes[row.extra_id]  | n/a                                        | x row.quantity ONLY (never x item.quantity — matches use-create-order.ts's pricing) |
export function resolveOrderConsumption(
  items: ConsumptionOrderItem[],
  book: RecipeBook
): OrderConsumption {
  const raw = new Map<string, number>();
  let itemsWithoutRecipe = 0;
  let malformedComboItems = 0;

  // Distinct burger_id/extra_id references already counted as "resolved but
  // recipe-less" — deduped across the WHOLE order so a reference appearing
  // in multiple lines/embeds is only counted once, per the spec.
  const countedWithoutRecipe = new Set<string>();

  const addConsumption = (supplyId: string, amount: number) => {
    if (!Number.isFinite(amount) || amount === 0) return;
    raw.set(supplyId, (raw.get(supplyId) ?? 0) + amount);
  };

  const applyBurgerRecipe = (
    burgerId: string,
    context: RecipeScalingContext,
    multiplier: number
  ) => {
    const lines = book.burgerRecipes.get(burgerId);
    if (!lines || lines.length === 0) {
      const key = `burger:${burgerId}`;
      if (!countedWithoutRecipe.has(key)) {
        countedWithoutRecipe.add(key);
        itemsWithoutRecipe++;
      }
      return;
    }
    for (const line of resolveRecipeQuantities(lines, context)) {
      addConsumption(line.supply_id, line.quantity * multiplier);
    }
  };

  const applyExtraRecipe = (extraId: string, multiplier: number) => {
    const lines = book.extraRecipes.get(extraId);
    if (!lines || lines.length === 0) {
      const key = `extra:${extraId}`;
      if (!countedWithoutRecipe.has(key)) {
        countedWithoutRecipe.add(key);
        itemsWithoutRecipe++;
      }
      return;
    }
    for (const line of lines) {
      addConsumption(line.supply_id, line.quantity * multiplier);
    }
  };

  for (const item of items) {
    if (item.combo_id) {
      const slots = parseComboSlots(item.customizations);
      if (!slots) {
        // No fallback data for a combo (unlike a burger line) — this item
        // contributes zero, including its attached extras (if any).
        malformedComboItems++;
        continue;
      }
      for (const slot of slots) {
        if (slot.slotType === "burger") {
          for (const b of slot.burgers ?? []) {
            if (!b.burgerId) continue;
            const defaults = book.burgerDefaults.get(b.burgerId);
            const fallback: RecipeScalingContext = defaults
              ? { meatQuantity: defaults.meat, friesQuantity: defaults.fries }
              : { meatQuantity: 1, friesQuantity: 1 };
            const context = makeScalingContext(b.meatCount, b.friesQuantity, fallback);
            applyBurgerRecipe(b.burgerId, context, b.quantity * item.quantity);

            for (const ext of b.extras ?? []) {
              if (!ext.id) continue;
              applyExtraRecipe(ext.id, ext.quantity * b.quantity * item.quantity);
            }
          }
        } else {
          for (const e of slot.selectedExtras ?? []) {
            if (!e.id) continue;
            applyExtraRecipe(e.id, item.quantity);
          }
        }
      }
    } else if (item.burger_id) {
      const fallback: RecipeScalingContext = {
        meatQuantity: item.burgerDefaults?.meat ?? 1,
        friesQuantity: item.burgerDefaults?.fries ?? 1,
      };

      let parsed: BurgerLineCustomizations | null = null;
      if (item.customizations !== null) {
        try {
          parsed = JSON.parse(item.customizations) as BurgerLineCustomizations;
        } catch {
          parsed = null;
        }
      }

      // Malformed/missing JSON on a burger line DOES have fallback data
      // (the burger's own default config) — unlike a combo, so the line is
      // never dropped, just deducted at default config. Not counted as
      // itemsWithoutRecipe (the item genuinely has a recipe) nor as
      // malformedComboItems (that counter is combo-only).
      const context = parsed
        ? makeScalingContext(parsed.meatCount, parsed.friesQuantity, fallback)
        : fallback;

      applyBurgerRecipe(item.burger_id, context, item.quantity);
    } else if (item.extra_id) {
      applyExtraRecipe(item.extra_id, item.quantity);
    } else {
      // All three FK columns null — the menu item was removed from the
      // catalog after this order was placed. Contributes zero.
      itemsWithoutRecipe++;
    }

    for (const ext of item.attachedExtras) {
      applyExtraRecipe(ext.extra_id, ext.quantity);
    }
  }

  const consumption = new Map<string, number>();
  for (const [supplyId, amount] of raw) {
    const rounded = round3(amount);
    if (Number.isFinite(rounded) && rounded !== 0) {
      consumption.set(supplyId, rounded);
    }
  }

  return { consumption, itemsWithoutRecipe, malformedComboItems };
}

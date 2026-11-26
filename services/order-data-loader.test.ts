import { describe, expect, it } from "vitest";
import { loadOrderIntoWizard } from "./order-data-loader";
import { OrderDataTransformer } from "@/components/order-wizard/services/order-data-transformer";

const FRIES_EXTRA = { price: 2500 };
const MEAT_EXTRA = { price: 3000 };

const burger = {
  id: "burger-doble",
  name: "Doble solo queso",
  base_price: 8000,
  default_meat_quantity: 2,
  default_fries_quantity: 1,
};

function makeCombo(rules: Record<string, unknown>) {
  return {
    id: "combo-1",
    name: "doble sin papas promo",
    price: 10000,
    slots: [
      {
        id: "slot-1",
        slot_type: "burger",
        quantity: 1,
        default_meat_quantity: 2,
        rules: { min_quantity: 1, max_quantity: 1, ...rules },
      },
    ],
  };
}

function makeOrder(burgerData: Record<string, unknown>) {
  return {
    id: "order-1",
    customer_name: "Test",
    delivery_type: "pickup",
    items: [
      {
        id: "item-1",
        burger_id: null,
        combo_id: "combo-1",
        burger_name: "doble sin papas promo",
        quantity: 1,
        unit_price: 10000,
        subtotal: 10000,
        customizations: JSON.stringify([
          {
            slotId: "slot-1",
            slotType: "burger",
            burgers: [
              {
                burgerId: "burger-doble",
                name: "Doble solo queso",
                meatCount: 2,
                isVeggie: false,
                quantity: 1,
                removedIngredients: [],
                extras: [],
                ...burgerData,
              },
            ],
            selectedExtras: [],
          },
        ]),
        extras: [],
      },
    ],
  } as any;
}

function roundTripComboSubtotal(order: any, combo: any) {
  const loaded = loadOrderIntoWizard(order, [], [burger], [combo], MEAT_EXTRA);
  const [item] = OrderDataTransformer.transformCombosToOrderItems(
    loaded.combos as any,
    MEAT_EXTRA,
    FRIES_EXTRA,
  );
  return item;
}

describe("loadOrderIntoWizard - combo fries reference", () => {
  it("does not charge a fries discount for a no_fries slot when re-editing", () => {
    const item = roundTripComboSubtotal(
      makeOrder({ friesQuantity: 0, referenceFriesQuantity: 0 }),
      makeCombo({ no_fries: true }),
    );
    expect(item.subtotal).toBe(10000);
  });

  it("handles legacy rows without referenceFriesQuantity in a no_fries slot", () => {
    const item = roundTripComboSubtotal(
      makeOrder({ friesQuantity: 0 }),
      makeCombo({ no_fries: true }),
    );
    expect(item.subtotal).toBe(10000);
  });

  it("prefers the persisted referenceFriesQuantity over current slot rules", () => {
    // Combo rules changed after the order was placed (no_fries removed).
    const item = roundTripComboSubtotal(
      makeOrder({ friesQuantity: 0, referenceFriesQuantity: 0 }),
      makeCombo({}),
    );
    expect(item.subtotal).toBe(10000);
  });

  it("still discounts fries the user removed in a regular slot", () => {
    const item = roundTripComboSubtotal(
      makeOrder({ friesQuantity: 0 }),
      makeCombo({}),
    );
    expect(item.subtotal).toBe(7500);
  });

  it("persists referenceFriesQuantity in combo customizations", () => {
    const item = roundTripComboSubtotal(
      makeOrder({ friesQuantity: 0 }),
      makeCombo({ no_fries: true }),
    );
    const slots = JSON.parse(item.customizations as string);
    expect(slots[0].burgers[0].referenceFriesQuantity).toBe(0);
    expect(slots[0].burgers[0].friesAdjustment).toBe(0);
  });
});

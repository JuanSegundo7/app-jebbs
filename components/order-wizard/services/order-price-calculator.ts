import { SelectedBurger } from "@/lib/types/combo-types";
import { SelectedSide } from "../hooks/use-side-selection";

interface SelectedComboSlot {
  slotId: string;
  slotType: "burger" | "drink" | "side" | "nuggets";
  maxQuantity: number;
  defaultMeatCount?: number;
  burgers: SelectedBurger[];
  selectedExtras?: Array<{
    id: string;
    name: string;
    price: number;
  }>;
}

interface SelectedCombo {
  id: string;
  combo: { id: string; name: string; price: number };
  quantity: number;
  slots: SelectedComboSlot[];
}

interface PriceCalculatorParams {
  selectedBurgers: SelectedBurger[];
  selectedCombos: SelectedCombo[];
  selectedSides: SelectedSide[];
  deliveryType: "delivery" | "pickup";
  deliveryFee: number;
  meatExtra?: { price: number } | null;
  friesExtra?: { price: number } | null;
  discountType?: "amount" | "percentage" | "none";
  discountValue?: number;
}

export class OrderPriceCalculator {
  static calculateBurgersTotal(
    burgers: SelectedBurger[],
    friesExtra?: { price: number } | null,
  ): number {
    return burgers.reduce((total, item) => {
      const burgerTotal =
        (item.burger.base_price + item.meatPriceAdjustment) * item.quantity;

      const extrasTotal = item.selectedExtras.reduce(
        (acc, ext) => acc + ext.extra.price * ext.quantity,
        0,
      );

      let friesTotal = 0;
      if (friesExtra) {
        const baseFries = item.burger.default_fries_quantity ?? 1;
        const friesDiff = item.friesQuantity - baseFries;
        friesTotal = friesDiff * friesExtra.price * item.quantity;
      }

      return total + burgerTotal + extrasTotal + friesTotal;
    }, 0);
  }

  static calculateCombosTotal(
    combos: SelectedCombo[],
    meatExtra?: { price: number } | null,
    friesExtra?: { price: number } | null,
  ): number {
    return combos.reduce((comboAcc, c) => {
      const comboBasePrice = (c.combo?.price ?? 0) * c.quantity;

      const comboExtrasAndMore = c.slots.reduce((slotAcc, slot) => {
        const slotTotal = slot.burgers.reduce((burgerAcc, burger) => {
          const burgerExtras = burger.selectedExtras.reduce(
            (extAcc, ext) => extAcc + (ext.extra?.price ?? 0) * ext.quantity,
            0,
          );

          let meatAdjustment = 0;
          if (meatExtra) {
            const referenceMeatCount =
              slot.defaultMeatCount ?? burger.burger.default_meat_quantity ?? 2;
            const meatDiff = burger.meatCount - referenceMeatCount;
            meatAdjustment = meatDiff * meatExtra.price;
          }

          let friesAdjustment = 0;
          if (friesExtra) {
            const referenceFriesCount =
              burger.referenceFriesQuantity ??
              burger.burger.default_fries_quantity ??
              1;
            const friesDiff = burger.friesQuantity - referenceFriesCount;
            friesAdjustment = friesDiff * friesExtra.price;
          }

          return (
            burgerAcc +
            (burgerExtras + meatAdjustment + friesAdjustment) * burger.quantity
          );
        }, 0);

        // Drink/side slots are included in the combo price — no extra charge
        return slotAcc + slotTotal;
      }, 0);

      return comboAcc + comboBasePrice + comboExtrasAndMore;
    }, 0);
  }

  static calculateExtrasTotal(burgers: SelectedBurger[]): number {
    return burgers.reduce((total, item) => {
      const itemExtrasTotal = item.selectedExtras.reduce(
        (acc, ext) => acc + ext.extra.price * ext.quantity,
        0,
      );
      return total + itemExtrasTotal * item.quantity;
    }, 0);
  }

  static calculateDiscountAmount(
    subtotal: number,
    discountType: "amount" | "percentage" | "none",
    discountValue: number,
  ): number {
    const safeSubtotal = Number(subtotal) || 0;
    const safeValue = Number(discountValue) || 0;

    if (discountType === "none" || safeValue <= 0) {
      return 0;
    }

    if (discountType === "amount") {
      return Math.min(safeValue, safeSubtotal);
    }

    if (discountType === "percentage") {
      const percentage = Math.min(safeValue, 100);
      return (safeSubtotal * percentage) / 100;
    }

    return 0;
  }

  static calculateOrderTotal(params: {
    selectedBurgers: SelectedBurger[];
    selectedCombos: any[];
    selectedSides: SelectedSide[]; // ✅
    deliveryType: string;
    deliveryFee: number;
    meatExtra?: { price: number } | null;
    friesExtra?: { price: number } | null;
    discountType?: string;
    discountValue?: number;
    priceAdjustment?: number;
  }) {
    const safeBurgers = Array.isArray(params.selectedBurgers)
      ? params.selectedBurgers
      : [];
    const safeCombos = Array.isArray(params.selectedCombos)
      ? params.selectedCombos
      : [];
    const safeSides = Array.isArray(params.selectedSides) // ✅
      ? params.selectedSides
      : [];

    const subtotal = this.calculateSubtotal(
      safeBurgers,
      safeCombos,
      safeSides, // ✅
      params.meatExtra,
      params.friesExtra,
    );

    console.log("🔍 SUBTOTAL:", subtotal);

    const normalizedDiscountType =
      params.discountType === "amount" || params.discountType === "percentage"
        ? params.discountType
        : "none";

    const discountAmount = this.calculateDiscountAmount(
      subtotal,
      normalizedDiscountType,
      params.discountValue || 0,
    );

    console.log("🔍 DISCOUNT AMOUNT:", discountAmount);

    const deliveryFee =
      params.deliveryType === "delivery" ? Number(params.deliveryFee) || 0 : 0;

    console.log("🔍 DELIVERY FEE:", deliveryFee);

    const priceAdjustment = Number(params.priceAdjustment) || 0;

    const total = subtotal - discountAmount + deliveryFee + priceAdjustment;

    console.log("🔍 TOTAL FINAL:", total);

    return Number.isFinite(total) ? total : 0;
  }

  static calculateSubtotal(
    selectedBurgers: SelectedBurger[],
    selectedCombos: SelectedCombo[],
    selectedSides: SelectedSide[],
    meatExtra?: { price: number } | null,
    friesExtra?: { price: number } | null,
  ): number {
    const burgersTotal = this.calculateBurgersTotal(
      selectedBurgers,
      friesExtra,
    );

    const combosTotal = this.calculateCombosTotal(
      selectedCombos,
      meatExtra,
      friesExtra,
    );

    // ✅ Guard + incluye selectedExtras de cada side
    const safeSides = Array.isArray(selectedSides) ? selectedSides : [];
    const sidesTotal = safeSides.reduce((acc, side) => {
      const base = side.extra.price * side.quantity;
      const extras = side.selectedExtras.reduce(
        (sum, e) => sum + e.extra.price * e.quantity,
        0,
      );
      return acc + base + extras;
    }, 0);

    return burgersTotal + combosTotal + sidesTotal;
  }
}
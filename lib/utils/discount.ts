/**
 * Combined order discount: a percentage AND a fixed amount, both applied to
 * the items subtotal (delivery excluded), percentage first, then the fixed
 * amount. See scripts/024-order-combined-discount.sql for the storage contract.
 */

export type LegacyDiscountType = "amount" | "percentage" | "none";

const toNumber = (value: unknown): number => Number(value) || 0;

const round2 = (value: number): number => Math.round(value * 100) / 100;

/**
 * Clamps raw form input to the range the calculator already enforces
 * (percentage 0-100, fixed >= 0). Use it before PERSISTING, so the stored
 * columns never disagree with the discount that was actually applied.
 */
export function normalizeDiscountInputs(
  percentage: number,
  fixed: number,
): { percentage: number; fixed: number } {
  return {
    percentage: Math.min(Math.max(toNumber(percentage), 0), 100),
    fixed: Math.max(toNumber(fixed), 0),
  };
}

export function calculateCombinedDiscount(
  subtotal: number,
  percentage: number,
  fixed: number,
): { percentageAmount: number; fixedAmount: number; total: number } {
  const safeSubtotal = Math.max(toNumber(subtotal), 0);
  const safePercentage = Math.min(Math.max(toNumber(percentage), 0), 100);
  const safeFixed = Math.max(toNumber(fixed), 0);

  const percentageAmount = round2((safeSubtotal * safePercentage) / 100);
  const remaining = Math.max(safeSubtotal - percentageAmount, 0);
  const fixedAmount = Math.min(safeFixed, remaining);
  const total = Math.min(percentageAmount + fixedAmount, safeSubtotal);

  return { percentageAmount, fixedAmount, total };
}

/**
 * Maps the combined discount onto the legacy discount_type/discount_value
 * columns. The DB CHECK constraint only accepts 'amount' | 'percentage' |
 * 'none', so never return anything else.
 */
export function toLegacyDiscount(
  percentage: number,
  fixed: number,
  totalAmount: number,
): { discount_type: LegacyDiscountType; discount_value: number } {
  const hasPercentage = toNumber(percentage) > 0;
  const hasFixed = toNumber(fixed) > 0;

  if (hasPercentage && hasFixed) {
    return { discount_type: "amount", discount_value: toNumber(totalAmount) };
  }
  if (hasPercentage) {
    return { discount_type: "percentage", discount_value: toNumber(percentage) };
  }
  if (hasFixed) {
    return { discount_type: "amount", discount_value: toNumber(fixed) };
  }
  return { discount_type: "none", discount_value: 0 };
}

/**
 * Reads an order's discount parts. Falls back to the legacy columns when both
 * new columns are 0/missing (orders created between the migration backfill
 * and the deploy).
 */
export function resolveOrderDiscount(order: {
  discount_percentage?: number | null;
  discount_fixed?: number | null;
  discount_type?: string | null;
  discount_value?: number | null;
}): { percentage: number; fixed: number } {
  const percentage = toNumber(order.discount_percentage);
  const fixed = toNumber(order.discount_fixed);

  if (percentage !== 0 || fixed !== 0) {
    return { percentage, fixed };
  }

  const legacyValue = toNumber(order.discount_value);
  if (order.discount_type === "percentage") {
    return { percentage: legacyValue, fixed: 0 };
  }
  if (order.discount_type === "amount") {
    return { percentage: 0, fixed: legacyValue };
  }
  return { percentage: 0, fixed: 0 };
}

export function formatDiscountLabel(
  percentage: number,
  fixed: number,
  formatCurrency: (amount: number) => string,
): string {
  const hasPercentage = toNumber(percentage) > 0;
  const hasFixed = toNumber(fixed) > 0;

  if (hasPercentage && hasFixed) {
    return `Desc. ${percentage}% + ${formatCurrency(fixed)}`;
  }
  if (hasPercentage) return `Desc. ${percentage}%`;
  if (hasFixed) return `Desc. ${formatCurrency(fixed)}`;
  return "Desc.";
}

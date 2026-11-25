import { describe, expect, it } from "vitest";
import {
  calculateCombinedDiscount,
  formatDiscountLabel,
  normalizeDiscountInputs,
  resolveOrderDiscount,
  toLegacyDiscount,
} from "./discount";

describe("normalizeDiscountInputs", () => {
  it("keeps valid values untouched", () => {
    expect(normalizeDiscountInputs(10, 1000)).toEqual({ percentage: 10, fixed: 1000 });
  });
  it("caps the percentage at 100", () => {
    expect(normalizeDiscountInputs(150, 0)).toEqual({ percentage: 100, fixed: 0 });
  });
  it("floors negatives at 0", () => {
    expect(normalizeDiscountInputs(-5, -500)).toEqual({ percentage: 0, fixed: 0 });
  });
  it("coerces NaN, empty and string input like the calculator does", () => {
    expect(normalizeDiscountInputs(NaN, "" as unknown as number)).toEqual({ percentage: 0, fixed: 0 });
    expect(normalizeDiscountInputs("12.5" as unknown as number, "300" as unknown as number)).toEqual({
      percentage: 12.5,
      fixed: 300,
    });
  });
});

describe("calculateCombinedDiscount", () => {
  it("applies percentage only", () => {
    expect(calculateCombinedDiscount(20000, 10, 0)).toEqual({
      percentageAmount: 2000,
      fixedAmount: 0,
      total: 2000,
    });
  });

  it("applies fixed only", () => {
    expect(calculateCombinedDiscount(20000, 0, 1500)).toEqual({
      percentageAmount: 0,
      fixedAmount: 1500,
      total: 1500,
    });
  });

  it("applies percentage first, then fixed", () => {
    const r = calculateCombinedDiscount(20000, 10, 1000);
    expect(r.percentageAmount).toBe(2000);
    expect(r.fixedAmount).toBe(1000);
    expect(r.total).toBe(3000);
    expect(20000 - r.total).toBe(17000);
  });

  it("clamps the fixed part to what remains after the percentage", () => {
    const r = calculateCombinedDiscount(1000, 50, 900);
    expect(r.percentageAmount).toBe(500);
    expect(r.fixedAmount).toBe(500);
    expect(r.total).toBe(1000);
  });

  it("clamps percentage above 100 to 100", () => {
    const r = calculateCombinedDiscount(1000, 150, 0);
    expect(r.total).toBe(1000);
  });

  it("ignores negatives", () => {
    expect(calculateCombinedDiscount(1000, -10, -5).total).toBe(0);
  });

  it("coerces NaN and strings like Number(x) || 0", () => {
    expect(calculateCombinedDiscount(1000, NaN, NaN).total).toBe(0);
    expect(
      calculateCombinedDiscount("1000" as unknown as number, "10" as unknown as number, "50" as unknown as number)
        .total,
    ).toBe(150);
    expect(calculateCombinedDiscount(1000, undefined as unknown as number, 100).total).toBe(100);
  });

  it("returns zero for a zero or invalid subtotal", () => {
    expect(calculateCombinedDiscount(0, 10, 500).total).toBe(0);
    expect(calculateCombinedDiscount(NaN, 10, 500).total).toBe(0);
    expect(calculateCombinedDiscount(-100, 10, 500).total).toBe(0);
  });

  it("rounds the percentage portion to 2 decimals", () => {
    const r = calculateCombinedDiscount(100.01, 33.33, 0);
    expect(r.percentageAmount).toBe(33.33);
  });
});

describe("toLegacyDiscount", () => {
  it("percentage only", () => {
    expect(toLegacyDiscount(10, 0, 2000)).toEqual({
      discount_type: "percentage",
      discount_value: 10,
    });
  });
  it("fixed only", () => {
    expect(toLegacyDiscount(0, 500, 500)).toEqual({
      discount_type: "amount",
      discount_value: 500,
    });
  });
  it("both -> amount with total", () => {
    expect(toLegacyDiscount(10, 1000, 3000)).toEqual({
      discount_type: "amount",
      discount_value: 3000,
    });
  });
  it("none", () => {
    expect(toLegacyDiscount(0, 0, 0)).toEqual({
      discount_type: "none",
      discount_value: 0,
    });
  });
  it("never produces a value outside the CHECK constraint", () => {
    for (const [p, f] of [[0, 0], [5, 0], [0, 5], [5, 5]]) {
      expect(["amount", "percentage", "none"]).toContain(
        toLegacyDiscount(p, f, 10).discount_type,
      );
    }
  });
});

describe("resolveOrderDiscount", () => {
  it("uses the new columns when set", () => {
    expect(
      resolveOrderDiscount({
        discount_percentage: 10,
        discount_fixed: 500,
        discount_type: "amount",
        discount_value: 9999,
      }),
    ).toEqual({ percentage: 10, fixed: 500 });
  });

  it("falls back to legacy percentage when new columns are 0", () => {
    expect(
      resolveOrderDiscount({
        discount_percentage: 0,
        discount_fixed: 0,
        discount_type: "percentage",
        discount_value: 15,
      }),
    ).toEqual({ percentage: 15, fixed: 0 });
  });

  it("falls back to legacy amount when new columns are missing", () => {
    expect(
      resolveOrderDiscount({ discount_type: "amount", discount_value: 700 }),
    ).toEqual({ percentage: 0, fixed: 700 });
  });

  it("legacy none yields zeros", () => {
    expect(
      resolveOrderDiscount({
        discount_percentage: 0,
        discount_fixed: 0,
        discount_type: "none",
        discount_value: 20,
      }),
    ).toEqual({ percentage: 0, fixed: 0 });
  });

  it("handles null legacy and null new columns", () => {
    expect(
      resolveOrderDiscount({
        discount_percentage: null,
        discount_fixed: null,
        discount_type: null,
        discount_value: null,
      }),
    ).toEqual({ percentage: 0, fixed: 0 });
  });

  it("coerces string numerics from the DB", () => {
    expect(
      resolveOrderDiscount({
        discount_percentage: "10.00" as unknown as number,
        discount_fixed: "0.00" as unknown as number,
      }),
    ).toEqual({ percentage: 10, fixed: 0 });
  });
});

describe("formatDiscountLabel", () => {
  const fmt = (n: number) => `$${n}`;
  it("both", () => {
    expect(formatDiscountLabel(10, 500, fmt)).toBe("Desc. 10% + $500");
  });
  it("percentage only", () => {
    expect(formatDiscountLabel(10, 0, fmt)).toBe("Desc. 10%");
  });
  it("fixed only", () => {
    expect(formatDiscountLabel(0, 500, fmt)).toBe("Desc. $500");
  });
  it("none", () => {
    expect(formatDiscountLabel(0, 0, fmt)).toBe("Desc.");
  });
});

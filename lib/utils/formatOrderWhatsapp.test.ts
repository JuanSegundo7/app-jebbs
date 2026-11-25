import { describe, expect, it } from "vitest";
import { buildOrderMessageVars, type OrderForMessage } from "./formatOrderWhatsapp";
import { DEFAULT_APP_SETTINGS } from "@/lib/settings/defaults";

const base: OrderForMessage = {
  order_number: 1,
  created_at: "2026-01-01T12:00:00Z",
  customer_name: "Test",
  delivery_type: "pickup",
  delivery_fee: 0,
  payment_method: "cash",
  discount_amount: 0,
  price_adjustment: 0,
  total_amount: 0,
  order_items: [],
};

const vars = (o: Partial<OrderForMessage>) =>
  buildOrderMessageVars({ ...base, ...o }, DEFAULT_APP_SETTINGS);

describe("discount line in WhatsApp message", () => {
  it("is empty when there is no discount", () => {
    expect(vars({}).linea_descuento).toBe("");
  });

  it("shows percentage + fixed for a combined discount", () => {
    const line = vars({
      discount_percentage: 10,
      discount_fixed: 500,
      discount_type: "amount",
      discount_value: 2500,
      discount_amount: 2500,
    }).linea_descuento;
    expect(line).toContain("Desc. 10% + ");
    expect(line).toContain("500");
  });

  it("falls back to legacy percentage columns", () => {
    const line = vars({
      discount_type: "percentage",
      discount_value: 15,
      discount_amount: 1500,
    }).linea_descuento;
    expect(line.startsWith("Desc. 15% -")).toBe(true);
  });
});

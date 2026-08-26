import { DeliveryType, DiscountType, OrderSource, PaymentMethod } from "@/lib/types";
import { useState } from "react";

function getDefaultDeliveryTime(): string {
  const now = new Date();
  now.setMinutes(now.getMinutes() + 30);
  const hours = now.getHours().toString().padStart(2, "0");
  const minutes = now.getMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

const DEFAULT_DELIVERY_FEE_KEY = "jebbs_default_delivery_fee";

function getDefaultDeliveryFee(): number {
  if (typeof window === "undefined") return 2000;
  const stored = localStorage.getItem(DEFAULT_DELIVERY_FEE_KEY);
  if (!stored) return 2000;
  // Guard against a corrupted "NaN" string persisted before the /precios fix
  // (comma-decimal input wasn't normalized before Number()) — fall back to
  // the 2000 default instead of starting a new order with a NaN delivery fee.
  const parsed = Number(stored);
  return Number.isFinite(parsed) ? parsed : 2000;
}

// Same key precios/page.tsx writes to when the % is edited, and the same
// key use-create-order.ts / use-update-order.ts used to read live before
// this fix. Resolving it here — once, into wizard state — is what makes
// the commission actually freeze: a NEW order picks up today's default on
// mount, and an EDITED order overwrites it via loadSettings with whatever
// rate was frozen onto that order at creation (see order-data-loader.ts),
// never with today's live value.
const PEDIDOSYA_COMMISSION_PCT_KEY = "jebbs_pedidosya_commission_pct";

function getDefaultCommissionRate(): number {
  if (typeof window === "undefined") return 0;
  const stored = localStorage.getItem(PEDIDOSYA_COMMISSION_PCT_KEY);
  if (!stored) return 0;
  const parsed = Number(stored);
  return Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : 0;
}

export function useOrderSettings() {
  const [deliveryType, setDeliveryType] = useState<"delivery" | "pickup">(
    "pickup",
  );
  const [deliveryFee, setDeliveryFee] = useState(getDefaultDeliveryFee);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "transfer">(
    "cash",
  );
  // Where the order came from. "local" is the default for a brand-new
  // order — a PedidosYa order is an explicit choice made at the start of
  // the wizard (see components/order-wizard/steps/customer-step.tsx), not
  // the summary step, because it needs to bypass the customer-selection
  // gate on step 1. `null` only ever comes from loadSettings, for a legacy
  // order that predates this column — it must stay `null` through an edit,
  // never get silently defaulted to "local" (see loadSettings below).
  const [source, setSource] = useState<OrderSource | null>("local");
  const [commissionRate, setCommissionRate] = useState(
    getDefaultCommissionRate,
  );
  const [notes, setNotes] = useState("");
  const [discountType, setDiscountType] = useState<
    "amount" | "percentage" | "none"
  >("none");
  const [discountValue, setDiscountValue] = useState(0);
  // Flat manual amount, PedidosYa-only — see order-price-calculator.ts and
  // scripts/016-order-price-adjustment.sql for why this isn't a discount.
  const [priceAdjustment, setPriceAdjustment] = useState(0);
  const [deliveryTime, setDeliveryTime] = useState(getDefaultDeliveryTime);

  const reset = () => {
    setDeliveryType("delivery");
    setDeliveryFee(getDefaultDeliveryFee());
    setPaymentMethod("transfer");
    setSource("local");
    setCommissionRate(getDefaultCommissionRate());
    setDiscountType("none");
    setDiscountValue(0);
    setPriceAdjustment(0);
    setNotes("");
    setDeliveryTime(getDefaultDeliveryTime()); // recalcula al momento del reset
  };

  const loadSettings = (settings: {
    deliveryType: DeliveryType;
    deliveryFee: number;
    paymentMethod: PaymentMethod;
    source?: OrderSource | null;
    commissionRate?: number;
    discountType: DiscountType;
    discountValue: number;
    priceAdjustment?: number;
    notes: string;
    deliveryTime?: string;
  }) => {
    setDeliveryType(settings.deliveryType);
    setDeliveryFee(settings.deliveryFee);
    setPaymentMethod(settings.paymentMethod);
    // `undefined` (field never passed) defaults to "local"; an explicit
    // `null` (a legacy order with no source) must survive as `null` — see
    // the `source` state comment above for why this distinction matters.
    setSource(settings.source === undefined ? "local" : settings.source);
    setCommissionRate(settings.commissionRate ?? 0);
    setDiscountType(settings.discountType);
    setDiscountValue(settings.discountValue);
    setPriceAdjustment(settings.priceAdjustment ?? 0);
    setNotes(settings.notes);
    setDeliveryTime(settings.deliveryTime || "");
  };

  return {
    deliveryType,
    setDeliveryType,
    deliveryFee,
    setDeliveryFee,
    paymentMethod,
    setPaymentMethod,
    source,
    setSource,
    commissionRate,
    setCommissionRate,
    discountType,
    setDiscountType,
    discountValue,
    setDiscountValue,
    priceAdjustment,
    setPriceAdjustment,
    notes,
    setNotes,
    deliveryTime,
    setDeliveryTime,
    reset,
    loadSettings,
  };
}
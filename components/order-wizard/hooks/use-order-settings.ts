import { DeliveryType, DiscountType, OrderSource, PaymentMethod } from "@/lib/types";
import type { AppSettings } from "@/lib/types";
import { useRef, useState } from "react";

function getDefaultDeliveryTime(minutes: number): string {
  const now = new Date();
  now.setMinutes(now.getMinutes() + minutes);
  const hours = now.getHours().toString().padStart(2, "0");
  const mins = now.getMinutes().toString().padStart(2, "0");
  return `${hours}:${mins}`;
}

// Same row (`app_settings`, via `appSettings`/the ref) that precios/page.tsx
// used to write to when the % was edited (now /configuracion), and the same
// key use-create-order.ts / use-update-order.ts used to read live before
// this fix. Resolving it here — once, into wizard state — is what makes
// the commission actually freeze: a NEW order picks up today's default on
// mount, and an EDITED order overwrites it via loadSettings with whatever
// rate was frozen onto that order at creation (see order-data-loader.ts),
// never with today's live value.

export function useOrderSettings(appSettings: AppSettings) {
  // Always points at the latest `appSettings` without triggering a
  // re-render — see the comment on `reset()` below for why this matters.
  const appSettingsRef = useRef(appSettings);
  appSettingsRef.current = appSettings;

  const [deliveryType, setDeliveryType] = useState<"delivery" | "pickup">(
    "pickup",
  );
  const [deliveryFee, setDeliveryFee] = useState(
    () => appSettings.default_delivery_fee,
  );
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
    () => appSettings.pedidosya_commission_pct,
  );
  const [notes, setNotes] = useState("");
  const [discountType, setDiscountType] = useState<
    "amount" | "percentage" | "none"
  >("none");
  const [discountValue, setDiscountValue] = useState(0);
  // Flat manual amount, PedidosYa-only — see order-price-calculator.ts and
  // scripts/016-order-price-adjustment.sql for why this isn't a discount.
  const [priceAdjustment, setPriceAdjustment] = useState(0);
  const [deliveryTime, setDeliveryTime] = useState(() =>
    getDefaultDeliveryTime(appSettings.default_delivery_minutes),
  );

  const reset = () => {
    // Read from the ref, NOT the `appSettings` parameter closed over at the
    // initial render — `reset()` runs when order-wizard-drawer.tsx opens the
    // drawer in create mode, which happens long after the initial render (the
    // drawer stays mounted, only `open` toggles), so by then the
    // `["app-settings"]` query has almost certainly resolved. Reading the
    // closed-over parameter here could freeze the hardcoded defaults forever
    // if the wizard was first opened before that query settled.
    const current = appSettingsRef.current;
    setDeliveryType("delivery");
    setDeliveryFee(current.default_delivery_fee);
    setPaymentMethod("transfer");
    setSource("local");
    setCommissionRate(current.pedidosya_commission_pct);
    setDiscountType("none");
    setDiscountValue(0);
    setPriceAdjustment(0);
    setNotes("");
    setDeliveryTime(getDefaultDeliveryTime(current.default_delivery_minutes)); // recalcula al momento del reset
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

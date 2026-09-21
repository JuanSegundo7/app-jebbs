import { useMemo, useEffect, useRef } from "react";
import { useCustomerSelection } from "./use-customer-selection";
import { useBurgerSelection } from "./use-burger-selection";
import { useComboSelection } from "./use-combo-selection";
import { useOrderSettings } from "./use-order-settings";
import { useSettings } from "@/lib/hooks/use-app-settings";
import { OrderPriceCalculator } from "../services/order-price-calculator";
import { OrderDataTransformer } from "../services/order-data-transformer";
import { usePrintOrder } from "@/lib/hooks/use-print-order";
import {
  useCreateOrder,
  type OrderItemInput,
} from "@/lib/hooks/orders/use-create-order";
import {
  useCreateCustomer,
  useCreateCustomerAddress,
} from "@/lib/hooks/use-customers";
import type { Extra, OrderWithItems } from "@/lib/types";
import { loadOrderIntoWizard } from "@/services/order-data-loader";
import { useUpdateOrder } from "@/lib/hooks/orders/use-update-order";
import { useSidesSelection } from "./use-side-selection";

interface UseOrderWizardParams {
  meatExtra?: { price: number } | null;
  friesExtra?: { price: number } | null;
  mode?: "create" | "edit";
  orderToEdit?: OrderWithItems | null;
  allBurgers?: any[];
  allCombos?: any[];
  allExtras?: Extra[];
}

export function useOrderWizard({
  meatExtra,
  friesExtra,
  mode = "create",
  orderToEdit,
  allBurgers = [],
  allCombos = [],
  allExtras = [],
}: UseOrderWizardParams) {
  const isSubmittingRef = useRef(false);

  // ================= HOOKS =================
  const customer = useCustomerSelection();
  const burgers = useBurgerSelection(meatExtra);
  const combos = useComboSelection();
  const appSettings = useSettings();
  const settings = useOrderSettings(appSettings);
  const sides = useSidesSelection();

  const createOrder = useCreateOrder();
  const updateOrder = useUpdateOrder();
  const createCustomer = useCreateCustomer();
  const createCustomerAddress = useCreateCustomerAddress();
  const printOrder = usePrintOrder();

  // ================= COMPUTED =================

  const subtotal = useMemo(() => {
    return OrderPriceCalculator.calculateSubtotal(
      burgers.selectedBurgers,
      combos.selectedCombos,
      sides.selectedSides,
      meatExtra,
      friesExtra,
    );
  }, [
    burgers.selectedBurgers,
    combos.selectedCombos,
    sides.selectedSides,
    meatExtra,
    friesExtra,
  ]);

  const discountAmount = useMemo(() => {
    return OrderPriceCalculator.calculateDiscountAmount(
      subtotal,
      settings.discountType,
      settings.discountValue,
    );
  }, [subtotal, settings.discountType, settings.discountValue]);

  // PedidosYa handles its own delivery — the shop's delivery type/fee must
  // never factor into a PedidosYa order's total, regardless of whatever
  // `settings.deliveryType` happens to hold (it defaults to "delivery" on
  // reset, and nothing else resets it when source switches to "pedidosya",
  // since the radio that would do that is hidden for PedidosYa — see
  // summary-step.tsx). Mirrors handleSubmit's own `effectiveDeliveryType`
  // below for the "pedidosya forces pickup" rule specifically, so the total
  // shown on screen during the wizard always matches what actually gets
  // saved. Exposed on the hook's return value so the drawer can also pass
  // it down as SummaryStep's `deliveryType` prop, keeping every on-screen
  // "Envío" line consistent with this same total.
  const effectiveDeliveryType = useMemo(
    () => (settings.source === "pedidosya" ? "pickup" : settings.deliveryType),
    [settings.source, settings.deliveryType],
  );

  const orderTotal = useMemo(() => {
    const raw = OrderPriceCalculator.calculateOrderTotal({
      selectedBurgers: burgers.selectedBurgers,
      selectedCombos: combos.selectedCombos,
      selectedSides: sides.selectedSides,
      deliveryType: effectiveDeliveryType,
      deliveryFee: settings.deliveryFee,
      meatExtra,
      friesExtra,
      discountType: settings.discountType,
      discountValue: settings.discountValue,
      priceAdjustment: settings.priceAdjustment,
    });

    // Si el descuento es 100%, el total es 0 (incluye delivery fee)
    if (
      settings.discountType === "percentage" &&
      settings.discountValue >= 100
    ) {
      return 0;
    }

    return raw;
  }, [
    burgers.selectedBurgers,
    combos.selectedCombos,
    sides.selectedSides,
    effectiveDeliveryType,
    settings.deliveryFee,
    meatExtra,
    friesExtra,
    settings.discountType,
    settings.discountValue,
    settings.priceAdjustment,
  ]);

  const extrasTotal = useMemo(() => {
    return OrderPriceCalculator.calculateExtrasTotal(burgers.selectedBurgers);
  }, [burgers.selectedBurgers]);

  // A PedidosYa order has no customer to select or create (see handleSubmit
  // below), so the customer-selection gate doesn't apply to it.
  const canProceedFromCustomer =
    settings.source === "pedidosya" ? true : customer.canProceed;

  const canProceedFromBurgers = true;

  const canProceedFromSides =
    burgers.selectedBurgers.length > 0 ||
    combos.selectedCombos.length > 0 ||
    sides.selectedSides.length > 0;

  const canProceedFromCombos = useMemo(() => {
    if (combos.selectedCombos.length === 0) return true;
    return combos.selectedCombos.every((combo) => {
      return combo.slots.every((slot) => {
        const isRequired = slot.minQuantity > 0;
        if (!isRequired) return true;
        if (slot.slotType === "burger") {
          const totalQty = slot.burgers.reduce((acc, b) => acc + b.quantity, 0);
          return totalQty >= slot.minQuantity;
        }
        if (
          slot.slotType === "drink" ||
          slot.slotType === "side" ||
          slot.slotType === "nuggets"
        ) {
          return slot.selectedExtras.length >= slot.minQuantity;
        }
        return true;
      });
    });
  }, [combos.selectedCombos]);

  // ================= LOAD DATA IN EDIT MODE =================

  useEffect(() => {
    if (mode === "edit" && orderToEdit) {
      const wizardData = loadOrderIntoWizard(
        orderToEdit,
        allExtras,
        allBurgers,
        allCombos,
        meatExtra,
      );

      customer.loadCustomerData(wizardData.customerData);
      burgers.loadBurgers(wizardData.burgers);
      combos.loadCombos(wizardData.combos);
      settings.loadSettings(wizardData.settings);
      if (wizardData.sides) {
        sides.loadSides(wizardData.sides);
      }
    }
  }, [mode, orderToEdit]);

  // ================= ACTIONS =================

  const handleSubmit = async () => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    try {
      const allItems: OrderItemInput[] =
        OrderDataTransformer.transformToOrderPayload(
          burgers.selectedBurgers,
          combos.selectedCombos,
          meatExtra,
          friesExtra,
          sides.selectedSides,
        );

      if (!allItems || allItems.length === 0) {
        throw new Error("No hay items en el pedido");
      }

      let customerId = customer.selectedCustomer?.id;
      let customerAddressId = customer.selectedAddress;

      // PedidosYa orders never get a `customers` row — the customer belongs
      // to PedidosYa, not to us, and creating one would pollute the
      // customer list / ranking with a false top entry.
      if (!customerId && mode === "create" && settings.source !== "pedidosya") {
        const newCustomer = await createCustomer.mutateAsync({
          name: customer.newCustomerData.name,
          phone: customer.newCustomerData.phone,
        });
        customerId = newCustomer.id;
      }

      if (
        !customerAddressId &&
        settings.deliveryType === "delivery" &&
        mode === "create" &&
        settings.source !== "pedidosya"
      ) {
        if (!customerId)
          throw new Error("Customer ID is required to create address");
        const address = await createCustomerAddress.mutateAsync({
          customerId,
          address: customer.newAddressData.address,
          label: customer.newAddressData.label ?? "Principal",
          notes: customer.newAddressData.notes,
          is_default: true,
        });
        customerAddressId = address.id;
      }

      // PedidosYa handles its own delivery — never attach the shop's own
      // delivery type/fee/address to one of these orders, regardless of
      // whatever the delivery/address fields happen to hold (they can carry
      // stale state from before the source was switched to PedidosYa).
      // 🔑 Si quedó "delivery" sin dirección resuelta, cae a retiro en el local
      const effectiveDeliveryType =
        settings.source === "pedidosya"
          ? "pickup"
          : settings.deliveryType === "delivery" && !customerAddressId
            ? "pickup"
            : settings.deliveryType;

      const orderPayload = {
        customer_id: customerId ?? null,
        customer_name:
          settings.source === "pedidosya"
            ? customer.newCustomerData.name.trim() || "PedidosYa"
            : (customer.selectedCustomer?.name ?? customer.newCustomerData.name),
        source: settings.source,
        commission_rate:
          settings.source === "pedidosya" ? settings.commissionRate : null,
        price_adjustment:
          settings.source === "pedidosya" ? settings.priceAdjustment : 0,
        customer_address_id:
          effectiveDeliveryType === "delivery"
            ? (customerAddressId ?? null)
            : null,
        delivery_type: effectiveDeliveryType,
        delivery_fee:
          effectiveDeliveryType === "delivery" ? settings.deliveryFee : 0,
        payment_method: settings.paymentMethod,
        discount_type: settings.discountType,
        discount_value: settings.discountValue,
        // 🔑 FIX: discount_amount guardado en DB también refleja el total real
        // (incluye delivery fee cuando el descuento es 100%)
        discount_amount:
          orderTotal === 0
            ? subtotal +
              (effectiveDeliveryType === "delivery" ? settings.deliveryFee : 0)
            : discountAmount,
        items: allItems,
        notes: settings.notes || null,
        delivery_time: settings.deliveryTime || null,
      };

      let orderId: string;

      if (mode === "edit" && orderToEdit) {
        const updated = await updateOrder.mutateAsync({
          orderId: orderToEdit.id,
          payload: orderPayload,
        });
        orderId = updated.id;
      } else {
        const created = await createOrder.mutateAsync(orderPayload);
        orderId = created.id;
      }

      // PedidosYa orders skip the auto-print — that's kitchen-comanda
      // printing for orders we prepare, and PedidosYa manages its own
      // fulfillment. The manual reprint button in /historial stays
      // available for any order regardless of source (deliberate).
      if (settings.source !== "pedidosya") {
        try {
          await printOrder.mutateAsync(orderId);
        } catch (printError) {
          console.warn("⚠️ No se pudo imprimir automáticamente:", printError);
        }
      }
    } catch (error) {
      console.error("Error en submit:", error);
      throw error;
    } finally {
      isSubmittingRef.current = false;
    }
  };

  const resetAll = () => {
    customer.reset();
    burgers.reset();
    combos.resetState();
    settings.reset();
    sides.reset();
  };

  return {
    customer,
    burgers,
    combos,
    settings,
    sides,

    subtotal,
    orderTotal,
    effectiveDeliveryType,
    extrasTotal,
    discountAmount,
    canProceedFromCustomer,
    canProceedFromBurgers,
    canProceedFromSides,
    canProceedFromCombos,

    handleSubmit,
    resetAll,

    isSubmitting:
      mode === "edit" ? updateOrder.isPending : createOrder.isPending,
    isCreatingCustomer: createCustomer.isPending,
    isCreatingAddress: createCustomerAddress.isPending,

    mode,
    orderToEdit,
  };
}

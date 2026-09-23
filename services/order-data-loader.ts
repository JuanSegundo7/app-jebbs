import { nanoid } from "nanoid";
import type { Extra } from "@/lib/types";
import type { OrderWithItems } from "@/lib/types";
import { SelectedBurger, SelectedCombo } from "@/lib/types/combo-types";
import { SelectedSide } from "@/components/order-wizard/hooks/use-side-selection";

export function loadOrderIntoWizard(
  order: OrderWithItems,
  allExtras: Extra[],
  allBurgers: any[],
  allCombos: any[],
  meatExtra?: { price: number } | null,
) {
  return {
    customerData: loadCustomerData(order),
    burgers: loadBurgers(order, allBurgers, allExtras, meatExtra),
    combos: loadCombos(order, allCombos, allBurgers, allExtras),
    settings: loadSettings(order),
    sides: loadSides(order, allExtras),
  };
}

function loadCustomerData(order: OrderWithItems) {
  return {
    customerName: order.customer_name,
    customerId: order.customer_id,
    addressId: order.customer_address_id,
    address: order.customer_address || null,
  };
}

function loadSettings(order: OrderWithItems) {
  // 🔑 Si quedó "delivery" sin dirección guardada, mostrar como retiro en el local
  const deliveryType: "delivery" | "pickup" =
    order.delivery_type === "delivery" && !order.customer_address_id
      ? "pickup"
      : (order.delivery_type as "delivery" | "pickup");

  return {
    deliveryType,
    deliveryFee: order.delivery_fee || 0,
    deliveryTime: order.delivery_time || "",
    paymentMethod: order.payment_method as "cash" | "transfer",
    // Legacy orders predating this column have `source = null`. Passed
    // through as-is — NOT defaulted to "local" — so that saving an edit to
    // an old order (e.g. fixing a quantity) doesn't silently reclassify it.
    // The "unknown" bucket in bucketBySource (use-orders-history.ts) is
    // meant to hold these forever; defaulting here would corrupt it on the
    // first routine edit. The source toggle itself is hidden in edit mode
    // (it's not re-editable), so `null` always round-trips back to `null`.
    source: order.source,
    // Frozen commission rate this order was created with (null for local
    // orders / legacy rows). Re-threaded into wizard state so an edit
    // recomputes commission_amount from the ORIGINAL rate, not today's
    // live default — see use-order-settings.ts's commissionRate comment.
    commissionRate: order.commission_rate ?? 0,
    discountType:
      (order.discount_type as "amount" | "percentage" | "none") || "none",
    discountValue: order.discount_value || 0,
    // Frozen manual PedidosYa adjustment this order was created with (0 for
    // local orders / legacy rows). Re-threaded into wizard state so editing
    // an existing PedidosYa order doesn't lose it — see
    // use-order-settings.ts's loadSettings and scripts/016-order-price-adjustment.sql.
    priceAdjustment: order.price_adjustment || 0,
    notes: order.notes || "",
  };
}

function loadBurgers(
  order: OrderWithItems,
  allBurgers: any[],
  allExtras: Extra[],
  meatExtra?: { price: number } | null,
): SelectedBurger[] {
  // Sides se identifican por extra_id != null, no por parsear customizations
  const burgerItems = order.items.filter(
    (item) => !item.combo_id && !item.extra_id,
  );

  return burgerItems
    .map((item) => {
      const burger = allBurgers.find((b) => b.id === item.burger_id);
      if (!burger) {
        console.warn(`Burger ${item.burger_id} not found`);
        return null;
      }

      let customData: any = null;
      if (item.customizations) {
        try {
          customData = JSON.parse(item.customizations);
        } catch (e) {
          console.warn("Failed to parse burger customizations:", e);
        }
      }

      const selectedExtras = (item.extras || []).map((extraItem) => {
        const extra = allExtras.find((e) => e.id === extraItem.extra_id);
        return {
          extra: extra || {
            id: extraItem.extra_id,
            name: extraItem.extra_name,
            price: extraItem.unit_price,
            category: "extra" as const,
            is_available: true,
            created_at: new Date().toISOString(),
          },
          quantity: extraItem.quantity,
        };
      });

      const meatCount =
        customData?.meatCount || burger.default_meat_quantity || 2;
      const meatDiff = meatCount - (burger.default_meat_quantity || 2);
      const meatPriceAdjustment = meatExtra ? meatDiff * meatExtra.price : 0;

      return {
        id: nanoid(),
        burger,
        quantity: item.quantity,
        meatCount,
        isVeggie: customData?.isVeggie ?? false,
        friesQuantity:
          customData?.friesQuantity ?? burger.default_fries_quantity ?? 1,
        removedIngredients: customData?.removedIngredients || [],
        selectedExtras,
        meatPriceAdjustment,
      };
    })
    .filter(Boolean) as SelectedBurger[];
}

function loadSides(order: OrderWithItems, allExtras: Extra[]): SelectedSide[] {
  const sideItems = order.items.filter((item) => !!item.extra_id);

  return sideItems.map((item) => {
    const extra = allExtras.find((e) => e.id === item.extra_id);

    const selectedExtras = (item.extras || []).map((extraItem) => {
      const e = allExtras.find((e) => e.id === extraItem.extra_id);
      return {
        extra: e || {
          id: extraItem.extra_id,
          name: extraItem.extra_name,
          price: extraItem.unit_price,
          category: "extra" as const,
          is_available: true,
          created_at: new Date().toISOString(),
        },
        quantity: extraItem.quantity,
      };
    });

    if (!extra) {
      return {
        id: nanoid(),
        extra: {
          id: item.extra_id!,
          name: item.burger_name,
          price: item.unit_price,
          category: "sides" as const,
          is_available: true,
          created_at: new Date().toISOString(),
        } as Extra,
        quantity: item.quantity,
        selectedExtras,
        expanded: false,
      };
    }

    return {
      id: nanoid(),
      extra,
      quantity: item.quantity,
      selectedExtras,
      expanded: false,
    };
  });
}

function loadCombos(
  order: OrderWithItems,
  allCombos: any[],
  allBurgers: any[],
  allExtras: Extra[],
): SelectedCombo[] {
  const comboItems = order.items.filter((item) => item.combo_id);

  return comboItems
    .map((item) => {
      const combo = allCombos.find((c) => c.id === item.combo_id);

      let slotsData: any[] = [];
      if (item.customizations) {
        try {
          slotsData = JSON.parse(item.customizations);
        } catch (e) {
          console.warn("Failed to parse combo customizations:", e);
        }
      }

      const slots = slotsData
        .map((slotData) => {
          const originalSlot = combo?.slots?.find(
            (s: any) => s.id === slotData.slotId,
          );

          if (!originalSlot && !slotData.slotId) return null;

          const burgers = (slotData.burgers || [])
            .map((burgerData: any) => {
              const burger = allBurgers.find(
                (b) => b.id === burgerData.burgerId,
              );
              if (!burger) return null;

              const selectedExtras = (burgerData.extras || []).map(
                (extraData: any) => {
                  const extra = allExtras.find((e) => e.id === extraData.id);
                  return {
                    extra: extra || {
                      id: extraData.id,
                      name: extraData.name,
                      price: extraData.price,
                      category: "extra" as const,
                      is_available: true,
                      created_at: new Date().toISOString(),
                    },
                    quantity: extraData.quantity,
                  };
                },
              );

              return {
                id: nanoid(),
                burger,
                quantity: burgerData.quantity,
                meatCount: burgerData.meatCount,
                isVeggie: burgerData.isVeggie ?? false,
                friesQuantity: burgerData.friesQuantity,
                removedIngredients: burgerData.removedIngredients || [],
                selectedExtras,
                meatPriceAdjustment: 0,
                // Solo se bloquea si la burger guardada ES la fija del combo;
                // pedidos viejos con otra burger quedan editables.
                locked:
                  !!originalSlot?.rules?.fixed_burger_id &&
                  originalSlot.rules.fixed_burger_id === burgerData.burgerId,
              };
            })
            .filter(Boolean);

          // Backward compat: old orders used selectedExtra (singular)
          let selectedExtras: Extra[] = [];
          if (Array.isArray(slotData.selectedExtras)) {
            selectedExtras = slotData.selectedExtras.map((se: any) => {
              const found = allExtras.find((e) => e.id === se.id);
              return (
                found || {
                  id: se.id,
                  name: se.name,
                  price: se.price || 0,
                  category: "drink" as const,
                  is_available: true,
                  created_at: new Date().toISOString(),
                }
              );
            });
          } else if (slotData.selectedExtra) {
            const found = allExtras.find(
              (e) => e.id === slotData.selectedExtra.id,
            );
            selectedExtras = [
              found || {
                id: slotData.selectedExtra.id,
                name: slotData.selectedExtra.name,
                price: slotData.selectedExtra.price || 0,
                category: "drink" as const,
                is_available: true,
                created_at: new Date().toISOString(),
              },
            ];
          }

          return {
            slotId: slotData.slotId,
            slotType: slotData.slotType,
            maxQuantity: Number(originalSlot?.quantity) ?? 1,
            minQuantity:
              Number(originalSlot?.rules?.min_quantity) ??
              Number(originalSlot?.quantity) ??
              1,
            defaultMeatCount: Number(originalSlot?.default_meat_quantity) ?? 2,
            rules: originalSlot?.rules || { min_quantity: 1, max_quantity: 1 },
            burgers,
            selectedExtras,
          };
        })
        .filter(Boolean);

      return {
        id: nanoid(),
        combo: {
          id: item.combo_id || nanoid(),
          name: item.burger_name,
          price: Number(item.unit_price) || 0,
          description: combo?.description || null,
          is_available: combo?.is_available ?? true,
          created_at: combo?.created_at || new Date().toISOString(),
          slots: combo?.slots || [],
        },
        quantity: item.quantity,
        slots,
      };
    })
    .filter(Boolean) as SelectedCombo[];
}
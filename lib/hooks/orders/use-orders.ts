"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Order, OrderStatus, OrderWithItems } from "@/lib/types";
import {
  syncOrderStockForStatus,
  type OrderStockResult,
} from "./use-order-stock";

export function useOrders() {
  const supabase = createClient();

  return useQuery({
    queryKey: ["orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          `
          *,
          customer:customers (
            id,
            name,
            phone,
            customer_addresses (
              id,
              label,
              address,
              notes,
              is_default
            )
          ),
          order_items (
            id,
            burger_name,
            quantity,
            unit_price,
            subtotal,
            customizations,
            extra_id,
            order_item_extras (
              id,
              extra_name,
              quantity,
              unit_price,
              subtotal
            )
          )
        `,
        )
        .in("status", ["new", "ready"])
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Order[];
    },
    refetchInterval: 10000,
  });
}

export function useOrderWithItems(orderId: string | null) {
  const supabase = createClient();

  return useQuery({
    queryKey: ["order", orderId],
    enabled: !!orderId,

    queryFn: async () => {
      if (!orderId) return null;

      const { data: order, error: orderError } = await supabase
        .from("orders")
        .select(
          `
          *,
          customer: customers (
            phone
          ),
          customer_address: customer_addresses (
            id,
            label,
            address,
            is_default
          )
        `,
        )
        .eq("id", orderId)
        .single();

      if (orderError) throw orderError;

      const { data: items, error: itemsError } = await supabase
        .from("order_items")
        .select("*")
        .eq("order_id", orderId);

      if (itemsError) throw itemsError;

      if (!items || items.length === 0) {
        return { ...order, items: [] } as OrderWithItems;
      }

      const itemsWithExtras = await Promise.all(
        items.map(async (item) => {
          const { data: extras, error: extrasError } = await supabase
            .from("order_item_extras")
            .select("*")
            .eq("order_item_id", item.id);

          if (extrasError) throw extrasError;

          return {
            ...item,
            extras: extras ?? [],
          };
        }),
      );

      return {
        ...order,
        items: itemsWithExtras,
      } as OrderWithItems;
    },
  });
}

export function useUpdateOrderStatus() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({
      orderId,
      status,
    }: {
      orderId: string;
      status: OrderStatus;
    }) => {
      const { error } = await supabase
        .from("orders")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", orderId);

      if (error) throw error;

      // Status write succeeded first, stock sync second, deliberately in
      // that order and deliberately non-fatal: if stock sync fails, the
      // status change is real and must not be rolled back (this mutation
      // has optimistic-update rollback below — rethrowing here would
      // visually revert the card to its old status even though the DB
      // genuinely says otherwise, which is worse than a stock discrepancy
      // the user can be told about separately). The result carries
      // whatever happened so the caller can toast it.
      let stockResult: OrderStockResult | null = null;
      let stockError: unknown = null;
      try {
        stockResult = await syncOrderStockForStatus(orderId, status);
      } catch (e) {
        stockError = e;
      }

      return { orderId, status, stockResult, stockError };
    },

    onMutate: async ({ orderId, status }) => {
      await queryClient.cancelQueries({ queryKey: ["orders"] });
      const previousOrders = queryClient.getQueryData<Order[]>(["orders"]);

      queryClient.setQueryData<Order[]>(["orders"], (old) => {
        if (!old) return old;
        return old
          .map((order) =>
            order.id === orderId
              ? { ...order, status, updated_at: new Date().toISOString() }
              : order,
          )
          .filter(
            (order) => order.status === "new" || order.status === "ready",
          );
      });

      return { previousOrders };
    },

    onError: (_err, _vars, context) => {
      if (context?.previousOrders) {
        queryClient.setQueryData(["orders"], context.previousOrders);
      }
    },

    onSuccess: () => {
      queryClient.refetchQueries({
        queryKey: ["orders"],
        type: "active",
      });

      queryClient.invalidateQueries({
        queryKey: ["orders-history"],
        exact: false,
      });

      queryClient.invalidateQueries({ queryKey: ["supplies"] });
      queryClient.invalidateQueries({ queryKey: ["burgers-with-recipes"] });
      queryClient.invalidateQueries({ queryKey: ["extras-with-recipes"] });
    },
  });
}

export function useTogglePaymentStatus() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({
      orderId,
      isPaid,
    }: {
      orderId: string;
      isPaid: boolean;
    }) => {
      const { error } = await supabase
        .from("orders")
        .update({ is_paid: isPaid, updated_at: new Date().toISOString() })
        .eq("id", orderId);

      if (error) throw error;
    },
    onMutate: async ({ orderId, isPaid }) => {
      await queryClient.cancelQueries({ queryKey: ["orders"] });
      const previousOrders = queryClient.getQueryData<Order[]>(["orders"]);

      queryClient.setQueryData<Order[]>(["orders"], (old) => {
        if (!old) return old;
        return old.map((order) =>
          order.id === orderId ? { ...order, is_paid: isPaid } : order,
        );
      });

      return { previousOrders };
    },
    onError: (err, variables, context) => {
      if (context?.previousOrders) {
        queryClient.setQueryData(["orders"], context.previousOrders);
      }
    },
  });
}

export function useCancelOrder() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({ orderId }: { orderId: string }) => {
      const { error } = await supabase
        .from("orders")
        .update({
          status: "canceled",
          updated_at: new Date().toISOString(),
        })
        .eq("id", orderId);

      if (error) throw error;

      // Status write succeeded first, stock sync second, deliberately
      // non-fatal — same rationale as useUpdateOrderStatus. Canceling a
      // completed order reverses its deduction; canceling a new/ready order
      // is a no-op since nothing was ever deducted — syncOrderStockForStatus
      // handles both correctly with zero extra logic here, because
      // reverseOrderStockDeduction's own ledger-emptiness check is what
      // makes the no-op case free.
      let stockResult: OrderStockResult | null = null;
      let stockError: unknown = null;
      try {
        stockResult = await syncOrderStockForStatus(orderId, "canceled");
      } catch (e) {
        stockError = e;
      }

      return { orderId, stockResult, stockError };
    },

    onMutate: async ({ orderId }) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: ["orders"] }),
        queryClient.cancelQueries({ queryKey: ["orders-history"] }),
      ]);

      const previousOrders = queryClient.getQueryData<Order[]>(["orders"]);

      queryClient.setQueryData<Order[]>(["orders"], (old) =>
        old
          ?.map((order) =>
            order.id === orderId
              ? { ...order, status: "canceled" as OrderStatus }
              : order,
          )
          .filter(
            (order) => order.status === "new" || order.status === "ready",
          ),
      );

      return { previousOrders };
    },

    onError: (_err, _vars, context) => {
      if (context?.previousOrders) {
        queryClient.setQueryData(["orders"], context.previousOrders);
      }
    },

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["orders-history"],
        exact: false,
      });

      queryClient.invalidateQueries({ queryKey: ["supplies"] });
      queryClient.invalidateQueries({ queryKey: ["burgers-with-recipes"] });
      queryClient.invalidateQueries({ queryKey: ["extras-with-recipes"] });
    },
  });
}

export function useReactivateOrder() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({
      orderId,
      nextStatus,
    }: {
      orderId: string;
      nextStatus: "new" | "completed";
    }) => {
      const { error } = await supabase
        .from("orders")
        .update({
          status: nextStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", orderId);

      if (error) throw error;

      // Status write succeeded first, stock sync second, deliberately
      // non-fatal — same rationale as useUpdateOrderStatus. A single call
      // handles both directions nextStatus can take: reactivating to
      // "completed" deducts fresh since a canceled order's ledger was
      // already cleared by the cancel that led to it being "canceled";
      // reactivating to "new" reverses, which will almost always be a
      // no-op in practice since canceling already reversed it, but costs
      // only one empty-result SELECT and keeps the rule uniform with no
      // special-casing.
      let stockResult: OrderStockResult | null = null;
      let stockError: unknown = null;
      try {
        stockResult = await syncOrderStockForStatus(orderId, nextStatus);
      } catch (e) {
        stockError = e;
      }

      return { orderId, nextStatus, stockResult, stockError };
    },

    onMutate: async ({ orderId, nextStatus }) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: ["orders"] }),
        queryClient.cancelQueries({ queryKey: ["orders-history"] }),
      ]);

      const previousOrders = queryClient.getQueryData<Order[]>(["orders"]);

      queryClient.setQueryData<Order[]>(["orders"], (old) =>
        old?.map((order) =>
          order.id === orderId ? { ...order, status: nextStatus } : order,
        ),
      );

      return { previousOrders };
    },

    onError: (_err, _vars, context) => {
      if (context?.previousOrders) {
        queryClient.setQueryData(["orders"], context.previousOrders);
      }
    },

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["orders-history"],
        exact: false,
      });

      queryClient.invalidateQueries({ queryKey: ["supplies"] });
      queryClient.invalidateQueries({ queryKey: ["burgers-with-recipes"] });
      queryClient.invalidateQueries({ queryKey: ["extras-with-recipes"] });
    },
  });
}

// DEAD CODE: zero call sites anywhere in the app. Does NOT deduct stock —
// see lib/hooks/orders/use-order-stock.ts for the real completion path
// (wired into useUpdateOrderStatus). Delete this function in a follow-up;
// do not extend it or wire deduction into it — it isn't reachable.
export function useCompleteOrder() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (orderId: string) => {
      const { error } = await supabase
        .from("orders")
        .update({
          status: "completed",
          pending_print: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", orderId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
  });
}

export function useQuickPatchOrder() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({
      orderId,
      total_amount,
      payment_method,
      delivery_fee,
    }: {
      orderId: string;
      total_amount: number;
      payment_method: "cash" | "transfer";
      delivery_fee?: number;
    }) => {
      const { error } = await supabase
        .from("orders")
        .update({
          total_amount,
          payment_method,
          updated_at: new Date().toISOString(),
          // Recibir un delivery_fee acá significa que el staff resolvió el
          // costo de envío de un pedido "a confirmar" -- nunca queda
          // pending después de esto. Ver order-card.tsx: este es el único
          // lugar donde un pedido puede tocarse de nuevo una vez que su
          // status avanzó más allá de new/ready.
          ...(delivery_fee !== undefined
            ? { delivery_fee, delivery_fee_pending: false }
            : {}),
        })
        .eq("id", orderId);
      if (error) throw error;
    },
    onMutate: async ({ orderId, total_amount, payment_method, delivery_fee }) => {
      await queryClient.cancelQueries({ queryKey: ["orders"] });
      const previousOrders = queryClient.getQueryData<Order[]>(["orders"]);
      queryClient.setQueryData<Order[]>(["orders"], (old) =>
        old?.map((o) =>
          o.id === orderId
            ? {
                ...o,
                total_amount,
                payment_method,
                ...(delivery_fee !== undefined
                  ? { delivery_fee, delivery_fee_pending: false }
                  : {}),
              }
            : o,
        ),
      );
      return { previousOrders };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousOrders)
        queryClient.setQueryData(["orders"], context.previousOrders);
    },
    onSuccess: () => {
      queryClient.refetchQueries({ queryKey: ["orders"], type: "active" });
    },
  });
}

export function useTodayOrdersCount() {
  const supabase = createClient();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return useQuery({
    queryKey: ["orders-count-today"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .gte("created_at", today.toISOString());

      if (error) throw error;
      return count || 0;
    },
    refetchInterval: 30000,
  });
}
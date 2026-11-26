"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import {
  updateOrderWithItems,
  type UpdateOrderPayload,
} from "./update-order-with-items";

export type { UpdateOrderPayload };

export function useUpdateOrder() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      orderId,
      payload,
    }: {
      orderId: string;
      payload: UpdateOrderPayload;
    }) => {
      return updateOrderWithItems(supabase, orderId, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["orders-history"] });
      queryClient.invalidateQueries({ queryKey: ["order-with-items"] });
      queryClient.invalidateQueries({ queryKey: ["today-orders-count"] });
    },
    onError: (error) => {
      console.error("❌ Error actualizando pedido:", error);
    },
  });
}
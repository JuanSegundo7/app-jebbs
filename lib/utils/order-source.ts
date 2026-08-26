import type { OrderSource } from "@/lib/types";

export const orderSourceConfig: Record<
  OrderSource,
  {
    label: string;
    className: string;
  }
> = {
  local: {
    label: "🏠 Local",
    className: "bg-muted text-muted-foreground",
  },
  pedidosya: {
    label: "🛵 PedidosYa",
    className: "bg-red-500 text-white",
  },
};

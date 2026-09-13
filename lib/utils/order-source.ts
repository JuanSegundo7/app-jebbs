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
    className: "bg-[var(--status-canceled-tint)] text-[var(--status-canceled)]",
  },
  web: {
    label: "🌐 Web",
    className: "bg-[var(--color-chart-3)]/15 text-[var(--color-chart-3)]",
  },
};

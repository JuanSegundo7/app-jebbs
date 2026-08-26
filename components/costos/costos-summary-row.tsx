"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CircleDollarSign, TrendingUp, Package, AlertTriangle } from "lucide-react";
import { useSupplies, useAllBurgersWithRecipes } from "@/lib/hooks/use-supplies";
import {
  calculateInventoryValue,
  summarizeRecipes,
  MARGIN_TARGET_DEFAULT,
} from "@/lib/utils/costing";
import { formatCurrency } from "@/lib/utils/format";

// KPI row above the Insumos/Recetas tabs. Consumes useSupplies() and
// useAllBurgersWithRecipes() directly — both tabs below use the exact same
// TanStack Query keys, so this never triggers an extra network fetch, only
// an extra subscriber to an already-cached (or already-in-flight) query.
export function CostosSummaryRow() {
  const { data: supplies, isLoading: suppliesLoading } = useSupplies();
  const { data: burgers, isLoading: burgersLoading } = useAllBurgersWithRecipes();

  const isLoading = suppliesLoading || burgersLoading;

  if (isLoading) {
    return (
      <div id="costos-summary-row" className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  }

  const summary = summarizeRecipes(burgers ?? [], MARGIN_TARGET_DEFAULT);
  const inventoryValue = calculateInventoryValue(supplies ?? []);
  const isMarginHealthy = summary.avgMarginPct >= MARGIN_TARGET_DEFAULT;

  // Whichever alert is more urgent wins the tile: a burger already below
  // target margin is an active pricing problem; a $0 price or a missing
  // recipe are both data gaps — bad, but not actively losing money the way
  // a thin margin is. A missing price ranks above a missing recipe because
  // it's also silently pulling avgMarginPct up (see summarizeRecipes).
  const alert =
    summary.belowTargetCount > 0
      ? { text: `${summary.belowTargetCount} bajo margen`, urgent: true }
      : summary.withoutPriceCount > 0
        ? { text: `${summary.withoutPriceCount} sin precio`, urgent: true }
        : summary.withoutRecipeCount > 0
          ? { text: `${summary.withoutRecipeCount} sin receta`, urgent: true }
          : { text: "Sin alertas", urgent: false };

  const tiles: {
    key: string;
    icon: typeof CircleDollarSign;
    chipColor: string;
    value: string;
    valueColor?: string;
    label: string;
  }[] = [
    {
      key: "avg-cost",
      icon: CircleDollarSign,
      chipColor: "var(--color-chart-2)",
      value: formatCurrency(summary.avgUnitCost),
      label: "Costo promedio",
    },
    {
      key: "avg-margin",
      icon: TrendingUp,
      chipColor: "var(--color-chart-3)",
      value: `${summary.avgMarginPct.toFixed(1)}%`,
      valueColor: isMarginHealthy ? "var(--status-paid)" : "var(--status-canceled)",
      label: "Margen promedio",
    },
    {
      key: "inventory",
      icon: Package,
      chipColor: "var(--color-chart-4)",
      value: formatCurrency(inventoryValue),
      label: "Valor del inventario",
    },
    {
      key: "alerts",
      icon: AlertTriangle,
      chipColor: alert.urgent ? "var(--status-canceled)" : "var(--color-chart-5)",
      value: alert.text,
      valueColor: alert.urgent ? "var(--status-canceled)" : undefined,
      label: "Alertas",
    },
  ];

  return (
    <div id="costos-summary-row" className="grid gap-3 grid-cols-2 lg:grid-cols-4">
      {tiles.map((tile) => (
        <Card key={tile.key} className="ios-glass p-0 bg-card">
          <CardContent className="p-4">
            <div
              className="rounded-md p-1.5 w-fit mb-2"
              style={{
                backgroundColor: `color-mix(in srgb, ${tile.chipColor} 15%, transparent)`,
              }}
            >
              <tile.icon className="h-3.5 w-3.5" style={{ color: tile.chipColor }} />
            </div>
            <p
              className="text-xl font-bold leading-tight tabular-nums"
              style={tile.valueColor ? { color: tile.valueColor } : undefined}
            >
              {tile.value}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{tile.label}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

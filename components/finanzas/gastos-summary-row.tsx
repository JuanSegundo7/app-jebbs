"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Receipt, Wallet, Tag, Banknote } from "lucide-react";
import { formatCurrency } from "@/lib/utils/format";
import { categoryChartColor, type PaydayProgress } from "@/lib/utils/expenses";

export interface TopExpenseCategory {
  label: string;
  amount: number;
  color: string;
}

interface GastosSummaryRowProps {
  isLoading: boolean;
  expensesTotal: number;
  netRevenue: number;
  topCategory: TopExpenseCategory | null;
  // Total spent on salaries in the period (one-off payments + prorated
  // monthly templates), same figure as analytics.expensesByCategory.salaries.
  salariesTotal: number;
  // null => no active weekly/biweekly salary templates, tile falls back to
  // the generic label instead of showing a "0 de 0" counter.
  salariesProgress: PaydayProgress | null;
}

export function GastosSummaryRow({
  isLoading,
  expensesTotal,
  netRevenue,
  topCategory,
  salariesTotal,
  salariesProgress,
}: GastosSummaryRowProps) {
  if (isLoading) {
    return (
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  }

  const isNetPositive = netRevenue >= 0;

  const tiles: {
    key: string;
    icon: typeof Receipt;
    chipColor: string;
    value: string;
    valueColor?: string;
    label: string;
  }[] = [
    {
      key: "expenses",
      icon: Receipt,
      chipColor: "var(--status-canceled)",
      value: formatCurrency(expensesTotal),
      label: "Gastos del período",
    },
    {
      key: "net",
      icon: Wallet,
      chipColor: "var(--color-chart-2)",
      value: formatCurrency(netRevenue),
      valueColor: isNetPositive ? "var(--status-paid)" : "var(--status-canceled)",
      label: "Ingreso neto",
    },
    {
      key: "top-category",
      icon: Tag,
      chipColor: topCategory?.color ?? "var(--color-chart-1)",
      value: topCategory ? formatCurrency(topCategory.amount) : "—",
      label: topCategory
        ? `${topCategory.label} · categoría con más gasto`
        : "Categoría con más gasto",
    },
    {
      key: "salaries",
      icon: Banknote,
      chipColor: categoryChartColor.salaries,
      value: formatCurrency(salariesTotal),
      label: salariesProgress
        ? `Sueldos · ${salariesProgress.loaded} de ${salariesProgress.expected} pagos`
        : "Sueldos del período",
    },
  ];

  return (
    <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
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

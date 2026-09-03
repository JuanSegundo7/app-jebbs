"use client";

import { Receipt, Wallet, Tag, Banknote } from "lucide-react";
import { StatTile } from "@/components/ui/stat-tile";
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
        <StatTile
          key={tile.key}
          icon={tile.icon}
          color={tile.chipColor}
          value={tile.value}
          valueColor={tile.valueColor}
          label={tile.label}
          loading={isLoading}
        />
      ))}
    </div>
  );
}

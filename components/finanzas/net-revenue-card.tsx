"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Wallet } from "lucide-react";
import { formatCurrency } from "@/lib/utils/format";

interface NetRevenueCardProps {
  grossRevenue: number;
  expensesTotal: number;
  commissionTotal?: number;
  netRevenue: number;
  isLoading: boolean;
}

export function NetRevenueCard({
  grossRevenue,
  expensesTotal,
  commissionTotal = 0,
  netRevenue,
  isLoading,
}: NetRevenueCardProps) {
  if (isLoading) {
    return (
      <Card className="ios-glass p-0 bg-card">
        <CardContent className="p-4">
          <Skeleton className="h-24" />
        </CardContent>
      </Card>
    );
  }

  const isPositive = netRevenue >= 0;

  return (
    <Card className="ios-glass p-0 bg-card">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <div
            className="rounded-md p-1.5"
            style={{
              backgroundColor: "color-mix(in srgb, var(--color-chart-2) 15%, transparent)",
            }}
          >
            <Wallet className="h-3.5 w-3.5" style={{ color: "var(--color-chart-2)" }} />
          </div>
          <p className="text-sm font-medium">Ingreso neto</p>
        </div>

        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">Ingresos brutos</span>
            <span className="text-sm font-semibold tabular-nums">
              {formatCurrency(grossRevenue)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">Gastos del período</span>
            <span className="text-sm font-semibold tabular-nums text-[var(--status-canceled)]">
              −{formatCurrency(expensesTotal)}
            </span>
          </div>
          {commissionTotal > 0 && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">Comisión PedidosYa</span>
              <span className="text-sm font-semibold tabular-nums text-[var(--status-canceled)]">
                −{formatCurrency(commissionTotal)}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between gap-3 border-t pt-2.5">
            <span className="text-sm font-medium">Neto</span>
            <span
              className="text-base font-bold tabular-nums"
              style={{
                color: isPositive ? "var(--status-paid)" : "var(--status-canceled)",
              }}
            >
              {formatCurrency(netRevenue)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

"use client";

import { Card, CardContent } from "@/components/ui/card";
import { CardHeading } from "@/components/ui/card-heading";
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
      <Card className="p-0">
        <CardContent className="p-4">
          <Skeleton className="h-24" />
        </CardContent>
      </Card>
    );
  }

  const isPositive = netRevenue >= 0;

  return (
    <Card className="p-0">
      <CardContent className="p-4">
        <CardHeading icon={Wallet} iconColor="var(--color-chart-2)">
          Ingreso neto
        </CardHeading>

        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-callout text-muted-foreground">Ingresos brutos</span>
            <span className="text-callout numeric vibrant">
              {formatCurrency(grossRevenue)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-callout text-muted-foreground">Gastos del período</span>
            <span className="text-callout numeric vibrant text-[var(--status-canceled)]">
              −{formatCurrency(expensesTotal)}
            </span>
          </div>
          {commissionTotal > 0 && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-callout text-muted-foreground">Comisión PedidosYa</span>
              <span className="text-callout numeric vibrant text-[var(--status-canceled)]">
                −{formatCurrency(commissionTotal)}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between gap-3 border-t pt-2.5">
            <span className="text-callout font-medium">Neto</span>
            <span
              className="text-amount numeric"
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

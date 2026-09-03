"use client";

import { Card, CardContent } from "@/components/ui/card";
import { CardHeading } from "@/components/ui/card-heading";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { formatCurrency } from "@/lib/utils/format";
import type { PaymentBreakdown } from "@/lib/hooks/orders/use-orders-history";

interface PaymentMethodBreakdownProps {
  breakdown: PaymentBreakdown | undefined;
  isLoading: boolean;
  showChange: boolean;
}

const ROWS = [
  { key: "cash" as const, label: "Efectivo", emoji: "💵", color: "var(--color-chart-2)" },
  { key: "transfer" as const, label: "Transferencia", emoji: "🏦", color: "var(--color-chart-1)" },
  { key: "other" as const, label: "Otros", emoji: "📦", color: "var(--color-chart-3)" },
];

function ChangeIndicator({ change }: { change: number }) {
  const isPositive = change >= 0;
  return (
    <div
      className={`flex items-center gap-0.5 text-xs ${
        isPositive ? "text-[var(--status-paid)]" : "text-[var(--status-canceled)]"
      }`}
    >
      {isPositive ? (
        <TrendingUp className="h-3 w-3" />
      ) : (
        <TrendingDown className="h-3 w-3" />
      )}
      <span>{Math.abs(change).toFixed(1)}%</span>
    </div>
  );
}

export function PaymentMethodBreakdown({
  breakdown,
  isLoading,
  showChange,
}: PaymentMethodBreakdownProps) {
  if (isLoading) {
    return (
      <Card className="ios-glass p-0 bg-card">
        <CardContent className="p-4">
          <Skeleton className="h-40" />
        </CardContent>
      </Card>
    );
  }

  if (!breakdown || breakdown.total === 0) {
    return (
      <Card className="ios-glass p-0 bg-card">
        <CardContent className="p-4">
          <CardHeading icon={Wallet} iconColor="var(--color-chart-2)">
            Ingresos por método de pago
          </CardHeading>
          <p className="text-sm text-muted-foreground text-center py-6">
            Sin ingresos para el período seleccionado
          </p>
        </CardContent>
      </Card>
    );
  }

  const total = breakdown.total;
  const rowsData = {
    cash: breakdown.cash,
    transfer: breakdown.transfer,
    other: breakdown.other,
  };

  return (
    <Card className="ios-glass p-0 bg-card">
      <CardContent className="p-4">
        <CardHeading
          icon={Wallet}
          iconColor="var(--color-chart-2)"
          action={<span className="text-sm font-bold tabular-nums">{formatCurrency(total)}</span>}
        >
          Ingresos por método de pago
        </CardHeading>

        {/* 100% stacked bar */}
        <div className="flex w-full h-3 rounded overflow-hidden gap-0.5 mb-4">
          {ROWS.map((row) => {
            const amount = rowsData[row.key].amount;
            const pct = total > 0 ? (amount / total) * 100 : 0;
            if (pct <= 0) return null;
            return (
              <div
                key={row.key}
                className="rounded"
                style={{ flexGrow: pct, backgroundColor: row.color }}
              />
            );
          })}
        </div>

        <div className="space-y-2.5">
          {(["cash", "transfer", "other"] as const).map((key) => {
            const row = ROWS.find((r) => r.key === key)!;
            const data = rowsData[key];
            const amount = data.amount;
            const pctValue = total > 0 ? (amount / total) * 100 : 0;
            const orders = "orders" in data ? data.orders : undefined;

            return (
              <div key={key} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{
                      backgroundColor: `color-mix(in srgb, ${row.color} 15%, transparent)`,
                      border: `1.5px solid ${row.color}`,
                    }}
                  />
                  <span className="text-sm text-muted-foreground truncate">
                    {row.emoji} {row.label}
                  </span>
                  {orders !== undefined && (
                    <span className="text-xs text-muted-foreground shrink-0">
                      ({orders})
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {showChange && <ChangeIndicator change={data.change} />}
                  <span className="text-xs text-muted-foreground w-10 text-right tabular-nums">
                    {pctValue.toFixed(0)}%
                  </span>
                  <span className="text-sm font-semibold tabular-nums w-24 text-right">
                    {formatCurrency(amount)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

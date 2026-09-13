"use client";

import { Card, CardContent } from "@/components/ui/card";
import { CardHeading } from "@/components/ui/card-heading";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingDown, TrendingUp, Store } from "lucide-react";
import { formatCurrency } from "@/lib/utils/format";
import type { SourceBreakdown } from "@/lib/hooks/orders/use-orders-history";

interface SourceBreakdownCardProps {
  breakdown: SourceBreakdown | undefined;
  isLoading: boolean;
  showChange: boolean;
}

const ROWS = [
  { key: "local" as const, label: "Local", emoji: "🏠", color: "var(--color-chart-2)" },
  { key: "pedidosya" as const, label: "PedidosYa", emoji: "🛵", color: "var(--color-chart-1)" },
  { key: "web" as const, label: "Web", emoji: "🌐", color: "var(--color-chart-4)" },
  { key: "unknown" as const, label: "Otros", emoji: "📦", color: "var(--color-chart-3)" },
];

function ChangeIndicator({ change }: { change: number }) {
  const isPositive = change >= 0;
  return (
    <div
      className={`flex items-center gap-0.5 text-caption ${
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

export function SourceBreakdownCard({
  breakdown,
  isLoading,
  showChange,
}: SourceBreakdownCardProps) {
  if (isLoading) {
    return (
      <Card className="p-0">
        <CardContent className="p-4">
          <Skeleton className="h-40" />
        </CardContent>
      </Card>
    );
  }

  if (!breakdown || breakdown.total === 0) {
    return (
      <Card className="p-0">
        <CardContent className="p-4">
          <CardHeading icon={Store} iconColor="var(--color-chart-2)">
            Ingresos por origen
          </CardHeading>
          <p className="text-subheadline text-muted-foreground text-center py-6">
            Sin ingresos para el período seleccionado
          </p>
        </CardContent>
      </Card>
    );
  }

  const total = breakdown.total;
  const rowsData = {
    local: breakdown.local,
    pedidosya: breakdown.pedidosya,
    web: breakdown.web,
    unknown: breakdown.unknown,
  };

  return (
    <Card className="p-0">
      <CardContent className="p-4">
        <CardHeading
          icon={Store}
          iconColor="var(--color-chart-2)"
          action={<span className="text-subheadline font-bold tabular-nums">{formatCurrency(total)}</span>}
        >
          Ingresos por origen
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
          {(["local", "pedidosya", "web", "unknown"] as const).map((key) => {
            const row = ROWS.find((r) => r.key === key)!;
            const data = rowsData[key];
            const amount = data.amount;
            const pctValue = total > 0 ? (amount / total) * 100 : 0;

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
                  <span className="text-subheadline text-muted-foreground truncate">
                    {row.emoji} {row.label}
                  </span>
                  {data.orders > 0 && (
                    <span className="text-caption text-muted-foreground shrink-0">
                      ({data.orders})
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {showChange && <ChangeIndicator change={data.change} />}
                  <span className="text-caption text-muted-foreground w-10 text-right tabular-nums">
                    {pctValue.toFixed(0)}%
                  </span>
                  <span className="text-subheadline font-semibold tabular-nums w-24 text-right">
                    {formatCurrency(amount)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {breakdown.pedidosya.commission > 0 && (
          <p className="mt-3 pt-3 border-t text-caption text-muted-foreground">
            Comisión PedidosYa del período:{" "}
            <span className="font-medium text-foreground">
              {formatCurrency(breakdown.pedidosya.commission)}
            </span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}

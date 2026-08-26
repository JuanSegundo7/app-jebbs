"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeftRight } from "lucide-react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { formatCurrency } from "@/lib/utils/format";

export interface DailyIncomeVsExpenseRow {
  date: string; // YYYY-MM-DD
  income: number;
  expense: number;
}

interface DailyIncomeVsExpensesChartProps {
  dailyData: DailyIncomeVsExpenseRow[];
  isLoading: boolean;
}

function formatAxisDate(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
  });
}

const chartConfig: ChartConfig = {
  income: { label: "Ingresos", color: "var(--status-paid)" },
  expense: { label: "Gastos", color: "var(--status-canceled)" },
};

export function DailyIncomeVsExpensesChart({
  dailyData,
  isLoading,
}: DailyIncomeVsExpensesChartProps) {
  if (isLoading) {
    return (
      <Card className="ios-glass p-0 bg-card">
        <CardContent className="p-4">
          <Skeleton className="h-64" />
        </CardContent>
      </Card>
    );
  }

  const hasMovement = dailyData.some((row) => row.income > 0 || row.expense > 0);

  return (
    <Card className="ios-glass p-0 bg-card">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div
              className="rounded-md p-1.5"
              style={{
                backgroundColor: "color-mix(in srgb, var(--status-paid) 15%, transparent)",
              }}
            >
              <ArrowLeftRight className="h-3.5 w-3.5" style={{ color: "var(--status-paid)" }} />
            </div>
            <p className="text-sm font-medium">Ingresos vs. gastos por día</p>
          </div>

          {/* Legend — colors are the income/expense polarity pair, not the
              categorical palette (matches NetRevenueCard/DailyLedger). */}
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: "var(--status-paid)" }}
              />
              Ingresos
            </span>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: "var(--status-canceled)" }}
              />
              Gastos
            </span>
          </div>
        </div>

        {!hasMovement ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Sin movimientos en este período
          </p>
        ) : (
          <ChartContainer config={chartConfig} className="h-64 w-full">
            <AreaChart data={dailyData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={formatAxisDate}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                tickLine={false}
                axisLine={false}
              />
              <ChartTooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0].payload as DailyIncomeVsExpenseRow;
                  return (
                    <div className="rounded-lg border bg-background px-3 py-2 shadow-md text-sm min-w-[160px]">
                      <p className="font-medium mb-2">{formatAxisDate(row.date)}</p>
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ background: "var(--status-paid)" }}
                        />
                        <span className="text-muted-foreground">Ingresos</span>
                        <span className="ml-auto font-medium tabular-nums">
                          {formatCurrency(row.income)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ background: "var(--status-canceled)" }}
                        />
                        <span className="text-muted-foreground">Gastos</span>
                        <span className="ml-auto font-medium tabular-nums">
                          {formatCurrency(row.expense)}
                        </span>
                      </div>
                    </div>
                  );
                }}
              />
              <Area
                dataKey="income"
                stroke="var(--status-paid)"
                fill="var(--status-paid)"
                fillOpacity={0.18}
                strokeWidth={2}
              />
              <Area
                dataKey="expense"
                stroke="var(--status-canceled)"
                fill="var(--status-canceled)"
                fillOpacity={0.18}
                strokeWidth={2}
              />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

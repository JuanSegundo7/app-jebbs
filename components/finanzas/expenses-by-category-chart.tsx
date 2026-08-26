"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tags } from "lucide-react";
import { Bar, BarChart, Cell, LabelList, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatCurrency } from "@/lib/utils/format";
import { categoryChartColor, categoryLabels } from "@/lib/utils/expenses";
import type { ExpenseCategory } from "@/lib/types";

const categoryOrder: ExpenseCategory[] = [
  "supplies",
  "services",
  "salaries",
  "rent",
  "other",
];

interface ExpensesByCategoryChartProps {
  data: Record<ExpenseCategory, number> | undefined;
  isLoading: boolean;
}

const ROW_HEIGHT = 44;
const MIN_HEIGHT = 140;

export function ExpensesByCategoryChart({ data, isLoading }: ExpensesByCategoryChartProps) {
  if (isLoading) {
    return (
      <Card className="ios-glass p-0 bg-card">
        <CardContent className="p-4">
          <Skeleton className="h-64" />
        </CardContent>
      </Card>
    );
  }

  // Ranked descending, $0 categories omitted — mirrors the convention
  // DailyLedger already uses of skipping days/rows with no movement.
  const chartData = categoryOrder
    .map((category) => ({
      category,
      label: categoryLabels[category],
      amount: data?.[category] ?? 0,
    }))
    .filter((row) => row.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  const chartConfig: ChartConfig = Object.fromEntries(
    categoryOrder.map((category) => [
      category,
      { label: categoryLabels[category], color: categoryChartColor[category] },
    ])
  );

  return (
    <Card className="ios-glass p-0 bg-card">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <div
            className="rounded-md p-1.5"
            style={{
              backgroundColor: "color-mix(in srgb, var(--color-chart-1) 15%, transparent)",
            }}
          >
            <Tags className="h-3.5 w-3.5" style={{ color: "var(--color-chart-1)" }} />
          </div>
          <p className="text-sm font-medium">Gasto por categoría</p>
        </div>

        {chartData.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Sin gastos en este período
          </p>
        ) : (
          <ChartContainer
            config={chartConfig}
            className="w-full"
            style={{ height: Math.max(MIN_HEIGHT, chartData.length * ROW_HEIGHT) }}
          >
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ left: 0, right: 72, top: 4, bottom: 4 }}
            >
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="label"
                width={82}
                tickLine={false}
                axisLine={false}
              />
              <ChartTooltip
                cursor={false}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0].payload as (typeof chartData)[number];
                  return (
                    <div className="rounded-lg border bg-background px-3 py-2 shadow-md text-sm min-w-[140px]">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ background: categoryChartColor[row.category] }}
                        />
                        <span className="text-muted-foreground">{row.label}</span>
                        <span className="ml-auto font-medium tabular-nums">
                          {formatCurrency(row.amount)}
                        </span>
                      </div>
                    </div>
                  );
                }}
              />
              <Bar dataKey="amount" radius={[0, 4, 4, 0]} barSize={22}>
                {chartData.map((row) => (
                  <Cell key={row.category} fill={categoryChartColor[row.category]} />
                ))}
                <LabelList
                  dataKey="amount"
                  position="right"
                  className="fill-foreground text-xs font-medium tabular-nums"
                  formatter={(value: number) => formatCurrency(value)}
                />
              </Bar>
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

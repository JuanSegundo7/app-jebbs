"use client";

import { Card, CardContent } from "@/components/ui/card";
import { CardHeading } from "@/components/ui/card-heading";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { formatCurrency } from "@/lib/utils/format";
import { MARGIN_TARGET_DEFAULT } from "@/lib/utils/costing";

export interface MarginByBurgerRow {
  id: string;
  name: string;
  marginPct: number;
  marginAmount: number;
  unitCost: number;
  basePrice: number;
}

interface MarginByBurgerChartProps {
  rows: MarginByBurgerRow[];
  isLoading: boolean;
}

const ROW_HEIGHT = 44;
const MIN_HEIGHT = 140;

const chartConfig: ChartConfig = {
  marginPct: { label: "Margen %" },
};

// Horizontal bar per hamburguesa (rows already excludes "sin receta" ones —
// see RecipesTab's chartRows). Green/red split against MARGIN_TARGET_DEFAULT
// answers "which burgers are actually profitable" at a glance, something the
// table alone doesn't surface without scanning every row.
export function MarginByBurgerChart({ rows, isLoading }: MarginByBurgerChartProps) {
  if (isLoading) {
    return (
      <Card id="costos-margin-chart" className="p-0">
        <CardContent className="p-4">
          <Skeleton className="h-40" />
        </CardContent>
      </Card>
    );
  }

  const chartData = [...rows].sort((a, b) => b.marginPct - a.marginPct);

  return (
    <Card id="costos-margin-chart" className="p-0">
      <CardContent className="p-4">
        <CardHeading icon={TrendingUp} iconColor="var(--color-chart-3)">
          Margen por hamburguesa
        </CardHeading>

        {chartData.length === 0 ? (
          <p className="text-subheadline text-muted-foreground text-center py-4">
            Cargá recetas para ver el margen por hamburguesa
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
              margin={{ left: 0, right: 44, top: 4, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                type="number"
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => `${v}%`}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={110}
                tickLine={false}
                axisLine={false}
              />
              <ChartTooltip
                cursor={false}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0].payload as MarginByBurgerRow;
                  const color =
                    row.marginPct >= MARGIN_TARGET_DEFAULT
                      ? "var(--status-paid)"
                      : "var(--status-canceled)";
                  return (
                    <div className="rounded-lg border bg-background px-3 py-2 shadow-md text-subheadline min-w-[180px]">
                      <p className="font-medium mb-2">{row.name}</p>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Costo</span>
                        <span className="tabular-nums">{formatCurrency(row.unitCost)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Precio</span>
                        <span className="tabular-nums">{formatCurrency(row.basePrice)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Margen</span>
                        <span className="font-medium tabular-nums" style={{ color }}>
                          {formatCurrency(row.marginAmount)} · {row.marginPct.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  );
                }}
              />
              <Bar dataKey="marginPct" radius={[0, 4, 4, 0]} barSize={22} isAnimationActive={false}>
                {chartData.map((row) => (
                  <Cell
                    key={row.id}
                    fill={
                      row.marginPct >= MARGIN_TARGET_DEFAULT
                        ? "var(--status-paid)"
                        : "var(--status-canceled)"
                    }
                  />
                ))}
                <LabelList
                  dataKey="marginPct"
                  position="right"
                  className="fill-foreground text-caption font-medium tabular-nums"
                  formatter={(value: number) => `${value.toFixed(1)}%`}
                />
              </Bar>
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

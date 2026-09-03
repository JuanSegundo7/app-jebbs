"use client";

import { Header } from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatTile } from "@/components/ui/stat-tile";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  TrendingDown,
  TrendingUp,
  ShoppingBag,
  DollarSign,
  CalendarIcon,
  Receipt,
  Trophy,
  Medal,
  XCircle,
  UtensilsCrossed,
} from "lucide-react";
import {
  useOrdersAnalytics,
  useMonthlyComparison,
  useTopBurgers,
  useProductStats,
} from "@/lib/hooks/orders/use-orders-history";
import { usePeriodSelector } from "@/lib/hooks/use-period-selector";
import { PeriodSelector } from "@/components/shared/period-selector";
import { formatCurrency } from "@/lib/utils/format";
import { ExternalIncomePanel } from "@/components/analytics/external-income-panel";
import { PaymentMethodBreakdown } from "@/components/analytics/payment-method-breakdown";
import { SourceBreakdownCard } from "@/components/analytics/source-breakdown";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";

// Rank config
const RANK_CONFIG = [
  {
    rank: 1,
    label: "1°",
    icon: Trophy,
    color: "#F59E0B",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/30",
    textColor: "text-amber-500",
    size: "scale-110",
    badgeText: "🥇 Top #1",
  },
  {
    rank: 2,
    label: "2°",
    icon: Medal,
    color: "#94A3B8",
    bgColor: "bg-slate-400/10",
    borderColor: "border-slate-400/30",
    textColor: "text-slate-400",
    size: "scale-100",
    badgeText: "🥈 #2",
  },
  {
    rank: 3,
    label: "3°",
    icon: Medal,
    color: "#CD7F32",
    bgColor: "bg-orange-800/10",
    borderColor: "border-orange-700/30",
    textColor: "text-orange-700",
    size: "scale-95",
    badgeText: "🥉 #3",
  },
];

export default function AnalyticsPage() {
  const period = usePeriodSelector();
  const { selectedDate, viewMode, customRange, periodLabel, startDate: panelStartDate, endDate: panelEndDate } = period;

  const resolvedCustomRange = viewMode === "custom" ? customRange : undefined;

  const { data: analytics, isLoading: analyticsLoading } = useOrdersAnalytics(
    selectedDate,
    viewMode,
    resolvedCustomRange
  );
  const { data: monthlyComparison, isLoading: comparisonLoading } =
    useMonthlyComparison();
  const { data: topBurgers, isLoading: burgersLoading } = useTopBurgers(
    selectedDate,
    viewMode,
    resolvedCustomRange
  );
  const { data: productStats, isLoading: productStatsLoading } = useProductStats(
    selectedDate,
    viewMode,
    resolvedCustomRange
  );

  const metrics = [
    {
      title: "Completados",
      value: analytics?.completedOrders || 0,
      change: analytics?.completedOrdersChange || 0,
      format: (v: number) => v.toString(),
      icon: ShoppingBag,
      color: "var(--color-chart-1)",
      invertChange: false,
    },
    {
      title: "Ingresos totales",
      value: analytics?.totalRevenue || 0,
      change: analytics?.revenueChange || 0,
      format: formatCurrency,
      icon: DollarSign,
      color: "var(--color-chart-2)",
      invertChange: false,
    },
    {
      title: "Pedidos/día",
      value: analytics?.avgOrdersPerDay || 0,
      change: analytics?.avgOrdersPerDayChange || 0,
      format: (v: number) => v.toFixed(1),
      icon: CalendarIcon,
      color: "var(--color-chart-3)",
      invertChange: false,
    },
    {
      title: "Ticket promedio",
      value: analytics?.avgTicket || 0,
      change: analytics?.avgTicketChange || 0,
      format: formatCurrency,
      icon: Receipt,
      color: "var(--color-chart-4)",
      invertChange: false,
    },
    {
      title: "Rechazados",
      value: analytics?.canceledOrders || 0,
      change: analytics?.canceledOrdersChange || 0,
      format: (v: number) => v.toString(),
      icon: XCircle,
      color: "var(--status-canceled)",
      invertChange: true, // more canceled = bad
    },
  ];

  const ordersChartConfig = {
    orders: { label: "Pedidos", color: "var(--color-chart-1)" },
  };
  const revenueChartConfig = {
    revenue: { label: "Ingresos", color: "var(--color-chart-2)" },
  };
  const comparisonChartConfig = {
    orders: { label: "Pedidos", color: "var(--color-chart-1)" },
    revenue: { label: "Ingresos", color: "var(--color-chart-2)" },
  };

  // Reorder podium: 2nd, 1st, 3rd for visual podium effect
  const podiumOrder = topBurgers
    ? [
        topBurgers.find((b) => b.rank === 2),
        topBurgers.find((b) => b.rank === 1),
        topBurgers.find((b) => b.rank === 3),
      ].filter(Boolean)
    : [];

  return (
    <section className="flex h-screen flex-col">
      <Header title="Rendimiento" subtitle="Análisis de ventas" />

      <div className="flex-1 overflow-auto py-4">
        {/* Period selector */}
        <PeriodSelector period={period} className="mb-6" />

        {/* Metrics cards */}
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
          {metrics.map((metric) => {
            const isPositive = metric.invertChange
              ? metric.change <= 0
              : metric.change >= 0;
            return (
              <StatTile
                key={metric.title}
                icon={metric.icon}
                color={metric.color}
                value={metric.format(metric.value)}
                label={metric.title}
                loading={analyticsLoading}
                delta={
                  viewMode !== "custom" && (
                    <div
                      className={`flex items-center gap-0.5 text-xs ${
                        isPositive
                          ? "text-[var(--status-paid)]"
                          : "text-[var(--status-canceled)]"
                      }`}
                    >
                      {isPositive ? (
                        <TrendingUp className="h-3 w-3" />
                      ) : (
                        <TrendingDown className="h-3 w-3" />
                      )}
                      <span>{Math.abs(metric.change).toFixed(1)}%</span>
                    </div>
                  )
                }
              />
            );
          })}
        </div>

        {/* Payment method + source breakdown */}
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <PaymentMethodBreakdown
            breakdown={analytics?.paymentBreakdown}
            isLoading={analyticsLoading}
            showChange={viewMode !== "custom"}
          />
          <SourceBreakdownCard
            breakdown={analytics?.sourceBreakdown}
            isLoading={analyticsLoading}
            showChange={viewMode !== "custom"}
          />
        </div>

        {/* External income */}
        <div className="mt-4">
          <ExternalIncomePanel startDate={panelStartDate} endDate={panelEndDate} />
        </div>

        {/* Product stats */}
        <Card className="mt-4 ios-glass bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <UtensilsCrossed className="h-5 w-5 text-muted-foreground" />
              Unidades vendidas
            </CardTitle>
          </CardHeader>
          <CardContent>
            {productStatsLoading ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-20" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
                {[
                  { label: "Burgers", value: productStats?.totalBurgers ?? 0, emoji: "🍔" },
                  { label: "Combos", value: productStats?.totalCombos ?? 0, emoji: "🎁" },
                  { label: "Medallones", value: productStats?.totalMedallones ?? 0, emoji: "🥩" },
                  { label: "Papas Fritas", value: productStats?.totalFries ?? 0, emoji: "🍟" },
                  { label: "Acompañamientos", value: productStats?.totalSides ?? 0, emoji: "🍗" },
                  { label: "Bebidas", value: productStats?.totalDrinks ?? 0, emoji: "🥤" },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="flex flex-col items-center justify-center gap-1 rounded-xl border bg-muted/30 px-4 py-4 text-center"
                  >
                    <span className="text-2xl leading-none">{item.emoji}</span>
                    <span className="text-2xl font-bold tabular-nums">{item.value}</span>
                    <span className="text-xs text-muted-foreground">{item.label}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Charts */}
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card className="ios-glass bg-card">
            <CardHeader>
              <CardTitle>Pedidos por día</CardTitle>
            </CardHeader>
            <CardContent>
              {analyticsLoading || !analytics?.dailyData ? (
                <Skeleton className="h-[300px]" />
              ) : (
                <ChartContainer
                  config={ordersChartConfig}
                  className="h-[300px] w-full"
                >
                  <AreaChart data={analytics.dailyData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="day"
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis tickLine={false} axisLine={false} />
                    <ChartTooltip
                      content={({ payload }) => {
                        if (!payload?.length) return null;
                        const row = payload[0].payload;
                        const d = row.date as string;
                        const label = new Date(d + "T12:00:00").toLocaleDateString("es-AR", {
                          day: "2-digit", month: "short",
                        });
                        return (
                          <div className="rounded-lg border bg-background px-3 py-2 shadow-md text-sm min-w-[140px]">
                            <p className="font-medium mb-2">{label}</p>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--color-chart-1)" }} />
                              <span className="text-muted-foreground">Completados</span>
                              <span className="ml-auto font-medium tabular-nums">{row.orders}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--status-canceled)" }} />
                              <span className="text-muted-foreground">Rechazados</span>
                              <span className="ml-auto font-medium tabular-nums">{row.canceled}</span>
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Area
                      dataKey="orders"
                      stroke="var(--color-chart-1)"
                      fill="var(--color-chart-1)"
                      fillOpacity={0.18}
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>

          <Card className="ios-glass bg-card">
            <CardHeader>
              <CardTitle>Ingresos por día</CardTitle>
            </CardHeader>
            <CardContent>
              {analyticsLoading || !analytics?.dailyData ? (
                <Skeleton className="h-[300px]" />
              ) : (
                <ChartContainer
                  config={revenueChartConfig}
                  className="h-[300px] w-full"
                >
                  <AreaChart data={analytics.dailyData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="day"
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                      tickLine={false}
                      axisLine={false}
                    />
                    <ChartTooltip
                      content={({ payload }) => {
                        if (!payload?.length) return null;
                        const row = payload[0].payload;
                        const d = row.date as string;
                        const label = new Date(d + "T12:00:00").toLocaleDateString("es-AR", {
                          day: "2-digit", month: "short",
                        });
                        return (
                          <div className="rounded-lg border bg-background px-3 py-2 shadow-md text-sm min-w-[160px]">
                            <p className="font-medium mb-2">{label}</p>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--color-chart-2)" }} />
                              <span className="text-muted-foreground">Ingresos</span>
                              <span className="ml-auto font-medium tabular-nums">{formatCurrency(row.revenue as number)}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--status-canceled)" }} />
                              <span className="text-muted-foreground">Rechazados</span>
                              <span className="ml-auto font-medium tabular-nums">{row.canceled}</span>
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Area
                      dataKey="revenue"
                      stroke="var(--color-chart-2)"
                      fill="var(--color-chart-2)"
                      fillOpacity={0.18}
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Top Burgers Podium */}
        <Card className="mt-6 ios-glass bg-card overflow-hidden">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-amber-500" />
                Hall of Fame — Más vendidas
              </CardTitle>
              <Badge variant="secondary" className="text-xs">
                {viewMode === "custom" ? periodLabel : viewMode === "month" ? "Este mes" : "Esta semana"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {burgersLoading ? (
              <div className="flex flex-col gap-3">
                <Skeleton className="h-28 w-full" />
                <div className="grid grid-cols-3 gap-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-36" />
                  ))}
                </div>
              </div>
            ) : !topBurgers || topBurgers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Trophy className="h-12 w-12 mb-3 opacity-20" />
                <p className="text-sm">
                  Sin datos para el período seleccionado
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Podium - top 3 */}
                {podiumOrder.length > 0 && (
                  <div className="flex items-end justify-center gap-3 pt-2 pb-4">
                    {podiumOrder.map((burger) => {
                      if (!burger) return null;
                      const cfg =
                        RANK_CONFIG.find((r) => r.rank === burger.rank) ||
                        RANK_CONFIG[2];
                      const isFirst = burger.rank === 1;

                      return (
                        <div
                          key={burger.id}
                          className={`flex flex-col items-center gap-2 transition-all ${cfg.size}`}
                        >
                          {/* Crown / medal */}
                          <span className="text-xl leading-none">
                            {burger.rank === 1
                              ? "👑"
                              : burger.rank === 2
                              ? "🥈"
                              : "🥉"}
                          </span>

                          {/* Card */}
                          <div
                            className={`relative flex flex-col items-center gap-2 rounded-2xl border p-4 transition-all ${
                              cfg.bgColor
                            } ${cfg.borderColor} ${
                              isFirst
                                ? "shadow-lg shadow-amber-500/10 min-w-[130px]"
                                : "min-w-[110px]"
                            }`}
                          >
                            {/* Image or emoji placeholder */}
                            {burger.image_url ? (
                              <img
                                src={burger.image_url}
                                alt={burger.name}
                                className={`rounded-full object-cover border-2 ${
                                  isFirst
                                    ? "h-16 w-16 border-amber-400"
                                    : "h-12 w-12 border-slate-400/40"
                                }`}
                              />
                            ) : (
                              <div
                                className={`flex items-center justify-center rounded-full bg-muted border-2 ${
                                  isFirst
                                    ? "h-16 w-16 border-amber-400 text-3xl"
                                    : "h-12 w-12 border-slate-400/40 text-2xl"
                                }`}
                              >
                                🍔
                              </div>
                            )}

                            {/* Name */}
                            <p
                              className={`text-center font-semibold leading-tight ${
                                isFirst ? "text-sm" : "text-xs"
                              }`}
                            >
                              {burger.name}
                            </p>

                            {/* Stats */}
                            <div className="flex flex-col items-center gap-0.5">
                              <span
                                className={`font-bold tabular-nums ${cfg.textColor} ${
                                  isFirst ? "text-xl" : "text-base"
                                }`}
                              >
                                {burger.totalSold}
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                unidades
                              </span>
                            </div>

                            {/* Revenue */}
                            <span className="text-[10px] text-muted-foreground font-medium">
                              {formatCurrency(burger.totalRevenue)}
                            </span>
                          </div>

                          {/* Podium base */}
                          <div
                            className={`w-full rounded-t-sm ${cfg.bgColor} border-t ${cfg.borderColor}`}
                            style={{
                              height:
                                burger.rank === 1
                                  ? "20px"
                                  : burger.rank === 2
                                  ? "12px"
                                  : "6px",
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Ranks 4 and 5 as a simple list */}
                {topBurgers.filter((b) => b.rank > 3).length > 0 && (
                  <div className="border-t pt-4 space-y-2">
                    {topBurgers
                      .filter((b) => b.rank > 3)
                      .map((burger) => (
                        <div
                          key={burger.id}
                          className="flex items-center gap-3 rounded-xl bg-muted/40 px-4 py-3"
                        >
                          <span className="text-muted-foreground font-bold text-sm w-5 text-center">
                            {burger.rank}°
                          </span>
                          {burger.image_url ? (
                            <img
                              src={burger.image_url}
                              alt={burger.name}
                              className="h-8 w-8 rounded-full object-cover"
                            />
                          ) : (
                            <span className="text-xl">🍔</span>
                          )}
                          <span className="flex-1 font-medium text-sm">
                            {burger.name}
                          </span>
                          <span className="text-sm text-muted-foreground tabular-nums">
                            {burger.totalSold} ud.
                          </span>
                          <span className="text-sm font-medium tabular-nums">
                            {formatCurrency(burger.totalRevenue)}
                          </span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Monthly comparison */}
        <Card className="mt-6 ios-glass bg-card">
          <CardHeader>
            <CardTitle>Comparativa últimos 3 meses</CardTitle>
          </CardHeader>
          <CardContent>
            {comparisonLoading || !monthlyComparison ? (
              <Skeleton className="h-75" />
            ) : (
              <ChartContainer
                config={comparisonChartConfig}
                className="h-75 w-full"
              >
                <BarChart data={monthlyComparison}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} />
                  <YAxis yAxisId="left" tickLine={false} axisLine={false} />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                    tickLine={false}
                    axisLine={false}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(v, name) => {
                          return name === "revenue"
                            ? [formatCurrency(v as number), " - Ingresos"]
                            : [v, "- Pedidos"];
                        }}
                      />
                    }
                  />
                  <Bar
                    yAxisId="left"
                    dataKey="orders"
                    fill="var(--color-chart-1)"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    yAxisId="right"
                    dataKey="revenue"
                    fill="var(--color-chart-2)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
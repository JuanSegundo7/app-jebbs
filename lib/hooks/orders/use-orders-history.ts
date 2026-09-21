"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Order, ExpenseCategory, RecurringExpense } from "@/lib/types";
import { expandRecurringExpenses } from "../../utils/expenses";

const TZ = "America/Argentina/Buenos_Aires";

// Get YYYY-MM-DD in Argentina timezone
function toArDateStr(date: Date): string {
  return date.toLocaleDateString("en-CA", { timeZone: TZ }); // en-CA = YYYY-MM-DD
}

// Build UTC Date from an Argentina local date string (YYYY-MM-DD)
// Argentina is always UTC-3 (no DST)
function arDateToUTC(dateStr: string, endOfDay = false): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  const h = endOfDay ? 23 : 0;
  const m = endOfDay ? 59 : 0;
  const s = endOfDay ? 59 : 0;
  return new Date(Date.UTC(year, month - 1, day, h + 3, m, s));
}

// Build a pure UTC-midnight calendar Date from a "YYYY-MM-DD" string, with
// no time-of-day component. Unlike `arDateToUTC` (which encodes an AR-local
// instant, offset +3h), this is for calendar-date-only math — the kind
// `expandRecurringExpenses` needs, since `start`/`end` in this file carry
// AR-local time-of-day info baked into their UTC instant and would
// off-by-one the day-boundary comparisons inside proration.
function dateStrToCalendarUTC(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function getMonthRange(date: Date): { start: Date; end: Date } {
  const ar = new Date(date.toLocaleString("en-US", { timeZone: TZ }));
  const year = ar.getFullYear();
  const month = ar.getMonth();
  const firstDay = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const lastDate = new Date(year, month + 1, 0).getDate();
  const lastDay = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDate).padStart(2, "0")}`;
  return { start: arDateToUTC(firstDay, false), end: arDateToUTC(lastDay, true) };
}

function getWeekRange(date: Date): { start: Date; end: Date } {
  const ar = new Date(date.toLocaleString("en-US", { timeZone: TZ }));
  const day = ar.getDay(); // 0=Sun
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(ar);
  monday.setDate(ar.getDate() + diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { start: arDateToUTC(fmt(monday), false), end: arDateToUTC(fmt(sunday), true) };
}

export type ViewMode = "month" | "week" | "custom";

// ─── Payment method breakdown ───────────────────────────────────────────────

export type MethodBuckets = {
  cash: { amount: number; orders: number };
  transfer: { amount: number; orders: number };
  unknown: { amount: number; orders: number };
};

export interface PaymentBreakdown {
  cash: { amount: number; orders: number; change: number };
  transfer: { amount: number; orders: number; change: number };
  other: { amount: number; change: number };
  total: number;
}

// ─── Source breakdown ───────────────────────────────────────────────────────

export type SourceBuckets = {
  local: { amount: number; orders: number };
  pedidosya: { amount: number; orders: number; commission: number };
  web: { amount: number; orders: number };
  unknown: { amount: number; orders: number };
};

export interface SourceBreakdown {
  local: { amount: number; orders: number; change: number };
  pedidosya: { amount: number; orders: number; commission: number; change: number };
  web: { amount: number; orders: number; change: number };
  // The non-PedidosYa share of external_income (events, catering, etc. —
  // anything not matched by the PedidosYa description backfill in
  // scripts/012-external-income-source.sql), plus any order whose `source`
  // is still unrecognized — same "absorb what has no dimension value" role
  // `other` plays in PaymentBreakdown, so local + pedidosya + web + unknown
  // === total exactly.
  unknown: { amount: number; orders: number; change: number };
  total: number;
}

// ─── Daily debit/credit ledger ──────────────────────────────────────────────

export interface LedgerEntry {
  date: string; // YYYY-MM-DD
  concept: string; // "Ventas", "Ingresos externos", or the expense's description
  kind: "income" | "expense";
  isProrated: boolean; // true for prorated recurring-expense allocations
  amount: number; // always positive; sign is implied by `kind`
  balance: number; // running cumulative balance across the whole period
}

const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  supplies: "Insumos",
  services: "Servicios",
  salaries: "Sueldos",
  rent: "Alquiler",
  other: "Otro",
};

// Classifies completed orders into cash/transfer/unknown buckets by
// payment_method. Anything other than a strict "cash"/"transfer" match
// (including null/undefined from rows predating the column) falls into
// "unknown" — never silently attributed to cash.
function bucketByPaymentMethod(
  orders: { total_amount: number; payment_method?: string | null }[] | null | undefined
): MethodBuckets {
  const buckets: MethodBuckets = {
    cash: { amount: 0, orders: 0 },
    transfer: { amount: 0, orders: 0 },
    unknown: { amount: 0, orders: 0 },
  };
  for (const o of orders || []) {
    const amount = Number(o.total_amount);
    if (o.payment_method === "cash") {
      buckets.cash.amount += amount;
      buckets.cash.orders += 1;
    } else if (o.payment_method === "transfer") {
      buckets.transfer.amount += amount;
      buckets.transfer.orders += 1;
    } else {
      buckets.unknown.amount += amount;
      buckets.unknown.orders += 1;
    }
  }
  return buckets;
}

// Classifies completed orders into local/pedidosya/web/unknown buckets by
// `source`. Anything other than a strict "local"/"pedidosya"/"web" match
// (including null/undefined from rows predating the column) falls into
// "unknown" — same convention as bucketByPaymentMethod above, never
// silently attributed to "local".
function bucketBySource(
  orders:
    | { total_amount: number; source?: string | null; commission_amount?: number | null }[]
    | null
    | undefined
): SourceBuckets {
  const buckets: SourceBuckets = {
    local: { amount: 0, orders: 0 },
    pedidosya: { amount: 0, orders: 0, commission: 0 },
    web: { amount: 0, orders: 0 },
    unknown: { amount: 0, orders: 0 },
  };
  for (const o of orders || []) {
    const amount = Number(o.total_amount);
    if (o.source === "local") {
      buckets.local.amount += amount;
      buckets.local.orders += 1;
    } else if (o.source === "pedidosya") {
      buckets.pedidosya.amount += amount;
      buckets.pedidosya.orders += 1;
      buckets.pedidosya.commission += Number(o.commission_amount ?? 0);
    } else if (o.source === "web") {
      buckets.web.amount += amount;
      buckets.web.orders += 1;
    } else {
      buckets.unknown.amount += amount;
      buckets.unknown.orders += 1;
    }
  }
  return buckets;
}

// Splits external_income into the PedidosYa share and everything else.
// A PedidosYa external row is NET — PedidosYa already took its commission
// before this money hit the books — so it contributes 0 to
// SourceBuckets.pedidosya.commission, unlike an order, whose total_amount
// is gross and whose commission is frozen on the row separately (see
// commission_amount on `orders`). `source` values other than "pedidosya"
// (including null, from rows predating this column) fall into `other` —
// same catch-all convention as bucketBySource above.
function splitExternalBySource(
  rows: { amount: number; source?: string | null }[] | null | undefined
): { pedidosya: number; other: number } {
  let pedidosya = 0;
  let other = 0;
  for (const r of rows || []) {
    const amount = Number(r.amount);
    if (r.source === "pedidosya") {
      pedidosya += amount;
    } else {
      other += amount;
    }
  }
  return { pedidosya, other };
}

// ─── useOrdersHistory ───────────────────────────────────────────────────────

export function useOrdersHistory(dateRange: { from: Date; to: Date }) {
  const supabase = createClient();

  return useQuery({
    queryKey: [
      "orders-history",
      dateRange.from.toISOString(),
      dateRange.to.toISOString(),
    ],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          `
          *,
          customer:customers (
            id,
            name,
            phone,
            customer_addresses (
              id,
              label,
              address,
              notes,
              is_default
            )
          ),
          order_items (
            id,
            burger_name,
            quantity,
            unit_price,
            subtotal,
            customizations,
            extra_id,
            order_item_extras (
              id,
              extra_name,
              quantity,
              unit_price,
              subtotal
            )
          )
        `
        )
        .gte("created_at", dateRange.from.toISOString())
        .lte("created_at", dateRange.to.toISOString())
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Order[];
    },
  });
}

// ─── useOrdersAnalytics ─────────────────────────────────────────────────────

export function useOrdersAnalytics(
  selectedDate: Date,
  viewMode: ViewMode = "month",
  customRange?: { from: Date; to: Date },
  enabled: boolean = true
) {
  const supabase = createClient();

  return useQuery({
    queryKey: ["orders-analytics", selectedDate.toISOString(), viewMode, customRange?.from?.toISOString(), customRange?.to?.toISOString()],
    enabled,
    queryFn: async () => {
      let start: Date, end: Date;
      if (viewMode === "custom" && customRange) {
        const fromStr = customRange.from.toLocaleDateString("en-CA", { timeZone: TZ });
        const toStr = customRange.to.toLocaleDateString("en-CA", { timeZone: TZ });
        start = arDateToUTC(fromStr, false);
        end = arDateToUTC(toStr, true);
      } else if (viewMode === "week") {
        ({ start, end } = getWeekRange(selectedDate));
      } else {
        ({ start, end } = getMonthRange(selectedDate));
      }

      // Previous period
      let prevStart: Date, prevEnd: Date;
      if (viewMode === "custom" && customRange) {
        const duration = end.getTime() - start.getTime();
        prevEnd = new Date(start.getTime() - 1);
        prevStart = new Date(prevEnd.getTime() - duration);
      } else if (viewMode === "week") {
        const ms7 = 7 * 24 * 60 * 60 * 1000;
        prevStart = new Date(start.getTime() - ms7);
        prevEnd = new Date(end.getTime() - ms7);
      } else {
        const ar = new Date(selectedDate.toLocaleString("en-US", { timeZone: TZ }));
        const prevMonthDate = new Date(ar.getFullYear(), ar.getMonth() - 1, 1);
        ({ start: prevStart, end: prevEnd } = getMonthRange(prevMonthDate));
      }

      // Compute date strings for external_income (DATE column, no TZ conversion needed)
      const startDateStr = toArDateStr(start);
      const endDateStr = toArDateStr(end);
      const prevStartDateStr = toArDateStr(prevStart);
      const prevEndDateStr = toArDateStr(prevEnd);

      const [
        { data: current, error: e1 },
        { data: prev, error: e2 },
        { data: canceled, error: e3 },
        { data: prevCanceled, error: e4 },
        { data: externalIncome, error: e5 },
        { data: prevExternalIncome, error: e6 },
        { data: expenses, error: e7 },
        { data: recurringExpenses, error: e8 },
        { data: prevExpenses, error: e9 },
      ] = await Promise.all([
        supabase
          .from("orders")
          .select("total_amount, updated_at, payment_method, source, commission_amount")
          .eq("status", "completed")
          .gte("updated_at", start.toISOString())
          .lte("updated_at", end.toISOString()),
        supabase
          .from("orders")
          .select("total_amount, updated_at, payment_method, source, commission_amount")
          .eq("status", "completed")
          .gte("updated_at", prevStart.toISOString())
          .lte("updated_at", prevEnd.toISOString()),
        supabase
          .from("orders")
          .select("id, updated_at")
          .eq("status", "canceled")
          .gte("updated_at", start.toISOString())
          .lte("updated_at", end.toISOString()),
        supabase
          .from("orders")
          .select("id, updated_at")
          .eq("status", "canceled")
          .gte("updated_at", prevStart.toISOString())
          .lte("updated_at", prevEnd.toISOString()),
        supabase
          .from("external_income")
          .select("date, amount, source")
          .gte("date", startDateStr)
          .lte("date", endDateStr),
        supabase
          .from("external_income")
          .select("date, amount, source")
          .gte("date", prevStartDateStr)
          .lte("date", prevEndDateStr),
        supabase
          .from("expenses")
          .select("date, amount, category, description")
          .gte("date", startDateStr)
          .lte("date", endDateStr),
        // All recurring_expenses (no date filter) — expandRecurringExpenses
        // needs every template to decide which ones overlap the period.
        supabase.from("recurring_expenses").select("*"),
        // Previous-period one-off expenses — same shape as the current-period
        // query above, needed for the export report's expensesChange/
        // netRevenueChange comparison (not shown anywhere on screen).
        supabase
          .from("expenses")
          .select("date, amount, category, description")
          .gte("date", prevStartDateStr)
          .lte("date", prevEndDateStr),
      ]);

      if (e1) throw e1;
      if (e2) throw e2;
      if (e3) throw e3;
      if (e4) throw e4;
      if (e5) throw e5;
      if (e6) throw e6;
      if (e7) throw e7;
      if (e8) throw e8;
      if (e9) throw e9;

      const currentCompleted = current?.length || 0;
      const prevCompleted = prev?.length || 0;
      const currentCanceled = canceled?.length || 0;
      const prevCanceled2 = prevCanceled?.length || 0;
      const currentOrdersRevenue =
        current?.reduce((acc, o) => acc + Number(o.total_amount), 0) || 0;
      const currentExternalRevenue =
        externalIncome?.reduce((acc, e) => acc + Number(e.amount), 0) || 0;
      const currentRevenue = currentOrdersRevenue + currentExternalRevenue;

      const prevOrdersRevenue =
        prev?.reduce((acc, o) => acc + Number(o.total_amount), 0) || 0;
      const prevExternalRevenue =
        prevExternalIncome?.reduce((acc, e) => acc + Number(e.amount), 0) || 0;
      const prevRevenue = prevOrdersRevenue + prevExternalRevenue;

      const msPerDay = 1000 * 60 * 60 * 24;
      const daysInPeriod =
        Math.round((end.getTime() - start.getTime()) / msPerDay);
      const daysInPrev =
        Math.round((prevEnd.getTime() - prevStart.getTime()) / msPerDay);

      const avgOrdersPerDay = currentCompleted / daysInPeriod;
      const prevAvgOrdersPerDay = prevCompleted / daysInPrev;
      const avgTicket =
        currentCompleted > 0 ? currentRevenue / currentCompleted : 0;
      const prevAvgTicket =
        prevCompleted > 0 ? prevRevenue / prevCompleted : 0;

      const pct = (curr: number, p: number) =>
        p > 0 ? ((curr - p) / p) * 100 : 0;

      // Payment method breakdown (cash / transfer / other)
      // "Other" = unknown payment_method orders + all external_income, so
      // cash + transfer + other === totalRevenue exactly.
      const currentBuckets = bucketByPaymentMethod(current);
      const prevBuckets = bucketByPaymentMethod(prev);
      const currentOtherAmount = currentBuckets.unknown.amount + currentExternalRevenue;
      const prevOtherAmount = prevBuckets.unknown.amount + prevExternalRevenue;

      const paymentBreakdown: PaymentBreakdown = {
        cash: {
          amount: currentBuckets.cash.amount,
          orders: currentBuckets.cash.orders,
          change: pct(currentBuckets.cash.amount, prevBuckets.cash.amount),
        },
        transfer: {
          amount: currentBuckets.transfer.amount,
          orders: currentBuckets.transfer.orders,
          change: pct(currentBuckets.transfer.amount, prevBuckets.transfer.amount),
        },
        other: {
          amount: currentOtherAmount,
          change: pct(currentOtherAmount, prevOtherAmount),
        },
        total: currentBuckets.cash.amount + currentBuckets.transfer.amount + currentOtherAmount,
      };

      // Source breakdown (local / pedidosya / web / unknown). PedidosYa-flagged
      // external_income (backfilled by scripts/012-external-income-source.sql,
      // or set going forward — though the panel has no source selector yet)
      // folds into the pedidosya bucket; only the rest falls back to the
      // "other absorbs what's left" trick unknown shares with paymentBreakdown
      // above — so the four buckets still sum to totalRevenue exactly.
      const currentSourceBuckets = bucketBySource(current);
      const prevSourceBuckets = bucketBySource(prev);
      const currentExternalSplit = splitExternalBySource(externalIncome);
      const prevExternalSplit = splitExternalBySource(prevExternalIncome);

      const currentPedidosyaAmount =
        currentSourceBuckets.pedidosya.amount + currentExternalSplit.pedidosya;
      const prevPedidosyaAmount =
        prevSourceBuckets.pedidosya.amount + prevExternalSplit.pedidosya;
      const currentUnknownSourceAmount =
        currentSourceBuckets.unknown.amount + currentExternalSplit.other;
      const prevUnknownSourceAmount =
        prevSourceBuckets.unknown.amount + prevExternalSplit.other;

      const sourceBreakdown: SourceBreakdown = {
        local: {
          amount: currentSourceBuckets.local.amount,
          orders: currentSourceBuckets.local.orders,
          change: pct(currentSourceBuckets.local.amount, prevSourceBuckets.local.amount),
        },
        pedidosya: {
          amount: currentPedidosyaAmount,
          orders: currentSourceBuckets.pedidosya.orders,
          commission: currentSourceBuckets.pedidosya.commission,
          change: pct(currentPedidosyaAmount, prevPedidosyaAmount),
        },
        web: {
          amount: currentSourceBuckets.web.amount,
          orders: currentSourceBuckets.web.orders,
          change: pct(currentSourceBuckets.web.amount, prevSourceBuckets.web.amount),
        },
        unknown: {
          amount: currentUnknownSourceAmount,
          orders: currentSourceBuckets.unknown.orders,
          change: pct(currentUnknownSourceAmount, prevUnknownSourceAmount),
        },
        total:
          currentSourceBuckets.local.amount +
          currentPedidosyaAmount +
          currentSourceBuckets.web.amount +
          currentUnknownSourceAmount,
      };

      // Commission is a real cost of the sale (PedidosYa keeps a cut), so it
      // reduces netRevenue below — see the netRevenue computation further
      // down, and the matching per-day ledger rows.
      const commissionTotal = currentSourceBuckets.pedidosya.commission;
      const prevCommissionTotal = prevSourceBuckets.pedidosya.commission;

      // Group completed by AR local date
      const dailyMap: Record<
        string,
        { orders: number; ordersRevenue: number; externalRevenue: number; canceled: number }
      > = {};
      for (const o of current || []) {
        const key = toArDateStr(new Date(o.updated_at));
        if (!dailyMap[key])
          dailyMap[key] = { orders: 0, ordersRevenue: 0, externalRevenue: 0, canceled: 0 };
        dailyMap[key].orders++;
        dailyMap[key].ordersRevenue += Number(o.total_amount);
      }
      // Group canceled by AR local date
      for (const o of canceled || []) {
        const key = toArDateStr(new Date(o.updated_at));
        if (!dailyMap[key])
          dailyMap[key] = { orders: 0, ordersRevenue: 0, externalRevenue: 0, canceled: 0 };
        dailyMap[key].canceled++;
      }
      // Add external income to its own bucket (date is already YYYY-MM-DD in AR time)
      for (const e of externalIncome || []) {
        const key = e.date;
        if (!dailyMap[key])
          dailyMap[key] = { orders: 0, ordersRevenue: 0, externalRevenue: 0, canceled: 0 };
        dailyMap[key].externalRevenue += Number(e.amount);
      }

      // Fill all days in range
      const dailyData: {
        date: string;
        day: number;
        orders: number;
        ordersRevenue: number;
        externalRevenue: number;
        revenue: number;
        canceled: number;
      }[] = [];
      const cursor = new Date(start);
      while (cursor <= end) {
        const key = toArDateStr(cursor);
        const dayNum = parseInt(key.split("-")[2], 10);
        const ordersRevenue = dailyMap[key]?.ordersRevenue || 0;
        const externalRevenue = dailyMap[key]?.externalRevenue || 0;
        dailyData.push({
          date: key,
          day: dayNum,
          orders: dailyMap[key]?.orders || 0,
          ordersRevenue,
          externalRevenue,
          revenue: ordersRevenue + externalRevenue,
          canceled: dailyMap[key]?.canceled || 0,
        });
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }

      // Net revenue = gross revenue - expenses (cash-basis: an expense
      // counts against the period it was paid in). One-off `expenses` are
      // already scoped to the period by the query above; recurring
      // templates are prorated by calendar-month day counts via
      // `expandRecurringExpenses`.
      //
      // `start`/`end` above are AR-local instants (arDateToUTC bakes in a
      // +3h offset for the AR->UTC conversion), not pure calendar dates —
      // feeding them directly into expandRecurringExpenses would off-by-one
      // its day-boundary math. Re-parse the already-computed
      // startDateStr/endDateStr (plain YYYY-MM-DD) into calendar-only UTC
      // midnight Dates instead.
      const calendarPeriodStart = dateStrToCalendarUTC(startDateStr);
      const calendarPeriodEnd = dateStrToCalendarUTC(endDateStr);

      const periodExpensesTotal =
        expenses?.reduce((acc, e) => acc + Number(e.amount), 0) || 0;
      const recurringAllocations = expandRecurringExpenses(
        (recurringExpenses ?? []) as RecurringExpense[],
        calendarPeriodStart,
        calendarPeriodEnd
      );
      const recurringTotal = recurringAllocations.reduce((acc, a) => acc + a.amount, 0);
      const expensesTotal = periodExpensesTotal + recurringTotal;
      const netRevenue = currentRevenue - expensesTotal - commissionTotal;

      // Previous-period expenses comparison — computed only for the export
      // report (expensesChange/netRevenueChange), never shown on screen.
      // Purely additive: mirrors the current-period calculation above with
      // the previous period's calendar bounds, reusing the same
      // `recurringExpenses` templates (period-independent) and the same
      // `expandRecurringExpenses` pure function.
      const calendarPrevPeriodStart = dateStrToCalendarUTC(prevStartDateStr);
      const calendarPrevPeriodEnd = dateStrToCalendarUTC(prevEndDateStr);

      const prevPeriodExpensesTotal =
        prevExpenses?.reduce((acc, e) => acc + Number(e.amount), 0) || 0;
      const prevRecurringAllocations = expandRecurringExpenses(
        (recurringExpenses ?? []) as RecurringExpense[],
        calendarPrevPeriodStart,
        calendarPrevPeriodEnd
      );
      const prevRecurringTotal = prevRecurringAllocations.reduce((acc, a) => acc + a.amount, 0);
      const prevExpensesTotal = prevPeriodExpensesTotal + prevRecurringTotal;
      const prevNetRevenue = prevRevenue - prevExpensesTotal - prevCommissionTotal;

      const expensesByCategory: Record<ExpenseCategory, number> = {
        supplies: 0,
        services: 0,
        salaries: 0,
        rent: 0,
        other: 0,
      };
      for (const e of expenses ?? []) {
        expensesByCategory[e.category as ExpenseCategory] += Number(e.amount);
      }
      for (const a of recurringAllocations) {
        expensesByCategory[a.category] += a.amount;
      }

      // ─── Daily debit/credit ledger ──────────────────────────────────────
      // Purely derived from data already fetched above: dailyData supplies
      // Ventas/Ingresos externos per day, `expenses` supplies one-off rows,
      // and `recurringAllocations` (already computed above) supplies
      // prorated fixed costs, one row per template. Walking dailyData in
      // order yields chronological ascending order for free — it was built
      // by advancing `cursor` from `start` to `end` one day at a time.
      const expensesByDate: Record<
        string,
        { amount: number; category: ExpenseCategory; description: string | null }[]
      > = {};
      for (const e of expenses ?? []) {
        const key = e.date;
        if (!expensesByDate[key]) expensesByDate[key] = [];
        expensesByDate[key].push({
          amount: Number(e.amount),
          category: e.category as ExpenseCategory,
          description: (e as { description?: string | null }).description ?? null,
        });
      }

      // Per-day PedidosYa commission, from the same `current` rows already
      // fetched above (they carry `source`/`commission_amount`) — grouped by
      // AR local date exactly like dailyMap is above, so a debit row can
      // land on the same day its sale did.
      const commissionByDate: Record<string, number> = {};
      for (const o of current || []) {
        if (o.source !== "pedidosya") continue;
        const amount = Number(o.commission_amount ?? 0);
        if (amount === 0) continue;
        const key = toArDateStr(new Date(o.updated_at));
        commissionByDate[key] = (commissionByDate[key] ?? 0) + amount;
      }

      const ledger: LedgerEntry[] = [];
      let runningBalance = 0;
      for (const day of dailyData) {
        if (day.ordersRevenue > 0) {
          runningBalance += day.ordersRevenue;
          ledger.push({
            date: day.date,
            concept: "Ventas",
            kind: "income",
            isProrated: false,
            amount: day.ordersRevenue,
            balance: runningBalance,
          });
        }
        if (day.externalRevenue > 0) {
          runningBalance += day.externalRevenue;
          ledger.push({
            date: day.date,
            concept: "Ingresos externos",
            kind: "income",
            isProrated: false,
            amount: day.externalRevenue,
            balance: runningBalance,
          });
        }
        const dayCommission = commissionByDate[day.date] ?? 0;
        if (dayCommission > 0) {
          runningBalance -= dayCommission;
          ledger.push({
            date: day.date,
            concept: "Comisión PedidosYa",
            kind: "expense",
            isProrated: false,
            amount: dayCommission,
            balance: runningBalance,
          });
        }
        for (const e of expensesByDate[day.date] ?? []) {
          if (e.amount === 0) continue;
          runningBalance -= e.amount;
          ledger.push({
            date: day.date,
            concept: e.description || `Gasto (${EXPENSE_CATEGORY_LABELS[e.category]})`,
            kind: "expense",
            isProrated: false,
            amount: e.amount,
            balance: runningBalance,
          });
        }
      }

      // One row PER RECURRING TEMPLATE for the whole period's prorated fixed
      // costs, placed at period close — instead of ~30 near-identical rows
      // per template (one per day) or a single anonymous lump. Reuses
      // `recurringAllocations` (already computed above for
      // expensesByCategory) so the ledger can never disagree with the KPI
      // totals about how much each template contributed. `concept` is the
      // template's own description ("Luz", "Alquiler", ...) — the
      // `isProrated: true` flag alone marks it as smoothed in the UI badge,
      // so the text itself doesn't repeat "prorrateado". The running
      // balance on every day up to this point is therefore higher than its
      // "true" smoothed value until these rows land; that's the deliberate
      // tradeoff (fewer rows, a visible step down instead of a gradual
      // daily decline). The final balance is unaffected — it's the same
      // total either way, since it's the same amounts deducted.
      for (const a of recurringAllocations) {
        if (a.amount === 0) continue;
        runningBalance -= a.amount;
        ledger.push({
          date: endDateStr,
          concept: a.description,
          kind: "expense",
          isProrated: true,
          amount: a.amount,
          balance: runningBalance,
        });
      }

      // Displayed total comes from `netRevenue` directly (already computed
      // above via currentRevenue - expensesTotal), never from re-summing
      // `ledger` entries — keeps the ledger's own sub-cent float drift (see
      // expandRecurringExpensesDaily) from ever reaching the UI's total.
      const ledgerClosingBalance = netRevenue;

      return {
        completedOrders: currentCompleted,
        completedOrdersChange: pct(currentCompleted, prevCompleted),
        totalRevenue: currentRevenue,
        revenueChange: pct(currentRevenue, prevRevenue),
        avgOrdersPerDay,
        avgOrdersPerDayChange: pct(avgOrdersPerDay, prevAvgOrdersPerDay),
        avgTicket,
        avgTicketChange: pct(avgTicket, prevAvgTicket),
        canceledOrders: currentCanceled,
        canceledOrdersChange: pct(currentCanceled, prevCanceled2),
        expensesTotal,
        expensesByCategory,
        netRevenue,
        dailyData,
        paymentBreakdown,
        sourceBreakdown,
        commissionTotal,
        ledger,
        ledgerClosingBalance,
      };
    },
  });
}

// ─── useMonthlyComparison ───────────────────────────────────────────────────

export function useMonthlyComparison() {
  const supabase = createClient();

  return useQuery({
    queryKey: ["monthly-comparison"],
    queryFn: async () => {
      const arNow = new Date(
        new Date().toLocaleString("en-US", { timeZone: TZ })
      );
      const months: { month: string; orders: number; revenue: number }[] = [];

      for (let i = 2; i >= 0; i--) {
        const monthDate = new Date(
          arNow.getFullYear(),
          arNow.getMonth() - i,
          1
        );
        const { start, end } = getMonthRange(monthDate);

        const { data, error } = await supabase
          .from("orders")
          .select("total_amount")
          .eq("status", "completed")
          .gte("updated_at", start.toISOString())
          .lte("updated_at", end.toISOString());

        if (error) throw error;

        const raw = monthDate.toLocaleDateString("es-AR", {
          month: "short",
          timeZone: TZ,
        });
        months.push({
          month: raw.charAt(0).toUpperCase() + raw.slice(1),
          orders: data?.length || 0,
          revenue:
            data?.reduce((acc, o) => acc + Number(o.total_amount), 0) || 0,
        });
      }

      return months;
    },
  });
}

// ─── useTopBurgers ──────────────────────────────────────────────────────────

export interface TopBurger {
  id: string;
  name: string;
  image_url: string | null;
  totalSold: number;
  totalRevenue: number;
  rank: number;
}

export function useTopBurgers(
  selectedDate: Date,
  viewMode: ViewMode = "month",
  customRange?: { from: Date; to: Date }
) {
  const supabase = createClient();

  return useQuery({
    queryKey: ["top-burgers", selectedDate.toISOString(), viewMode, customRange?.from?.toISOString(), customRange?.to?.toISOString()],
    queryFn: async (): Promise<TopBurger[]> => {
      let start: Date, end: Date;
      if (viewMode === "custom" && customRange) {
        const fromStr = customRange.from.toLocaleDateString("en-CA", { timeZone: TZ });
        const toStr = customRange.to.toLocaleDateString("en-CA", { timeZone: TZ });
        start = arDateToUTC(fromStr, false);
        end = arDateToUTC(toStr, true);
      } else if (viewMode === "week") {
        ({ start, end } = getWeekRange(selectedDate));
      } else {
        ({ start, end } = getMonthRange(selectedDate));
      }

      // Completed order IDs in range
      const { data: orders, error: ordersError } = await supabase
        .from("orders")
        .select("id")
        .eq("status", "completed")
        .gte("updated_at", start.toISOString())
        .lte("updated_at", end.toISOString());

      if (ordersError) throw ordersError;
      if (!orders || orders.length === 0) return [];

      const orderIds = orders.map((o) => o.id);

      // order_items uses burger_name (text) — consistent with existing useOrdersHistory select
      const { data: items, error: itemsError } = await supabase
        .from("order_items")
        .select("burger_name, quantity, unit_price, subtotal")
        .in("order_id", orderIds);

      if (itemsError) throw itemsError;
      if (!items || items.length === 0) return [];

      // Aggregate by burger_name
      const burgerMap: Record<
        string,
        { totalSold: number; totalRevenue: number }
      > = {};
      for (const item of items) {
        const key = item.burger_name;
        if (!key) continue;
        if (!burgerMap[key]) burgerMap[key] = { totalSold: 0, totalRevenue: 0 };
        burgerMap[key].totalSold += item.quantity;
        burgerMap[key].totalRevenue += Number(
          item.subtotal ?? item.unit_price * item.quantity
        );
      }

      // Fetch image_url from burgers table by name
      const burgerNames = Object.keys(burgerMap);
      const { data: burgerRows } = await supabase
        .from("burgers")
        .select("id, name, image_url")
        .in("name", burgerNames);

      const imageMap: Record<string, { id: string; image_url: string | null }> =
        {};
      for (const b of burgerRows || []) {
        imageMap[b.name] = { id: b.id, image_url: b.image_url };
      }

      return burgerNames
        .map((name) => ({
          id: imageMap[name]?.id ?? name,
          name,
          image_url: imageMap[name]?.image_url ?? null,
          totalSold: burgerMap[name].totalSold,
          totalRevenue: burgerMap[name].totalRevenue,
          rank: 0,
        }))
        .sort((a, b) => b.totalSold - a.totalSold)
        .slice(0, 5)
        .map((b, i) => ({ ...b, rank: i + 1 }));
    },
  });
}

// ─── useProductStats ─────────────────────────────────────────────────────────

export interface ProductStats {
  totalBurgers: number;
  totalMedallones: number;
  totalFries: number;
  totalSides: number;
  totalCombos: number;
  totalDrinks: number;
}

export function useProductStats(
  selectedDate: Date,
  viewMode: ViewMode = "month",
  customRange?: { from: Date; to: Date }
) {
  const supabase = createClient();

  return useQuery({
    queryKey: ["product-stats", selectedDate.toISOString(), viewMode, customRange?.from?.toISOString(), customRange?.to?.toISOString()],
    queryFn: async (): Promise<ProductStats> => {
      let start: Date, end: Date;
      if (viewMode === "custom" && customRange) {
        const fromStr = customRange.from.toLocaleDateString("en-CA", { timeZone: TZ });
        const toStr = customRange.to.toLocaleDateString("en-CA", { timeZone: TZ });
        start = arDateToUTC(fromStr, false);
        end = arDateToUTC(toStr, true);
      } else if (viewMode === "week") {
        ({ start, end } = getWeekRange(selectedDate));
      } else {
        ({ start, end } = getMonthRange(selectedDate));
      }

      const { data: orders, error: ordersError } = await supabase
        .from("orders")
        .select("id")
        .eq("status", "completed")
        .gte("updated_at", start.toISOString())
        .lte("updated_at", end.toISOString());

      if (ordersError) throw ordersError;
      if (!orders || orders.length === 0)
        return { totalBurgers: 0, totalMedallones: 0, totalFries: 0, totalSides: 0, totalCombos: 0, totalDrinks: 0 };

      const orderIds = orders.map((o) => o.id);

      // Embed order_item_extras inside the order_items query to avoid a second
      // request with thousands of UUIDs in the URL (which hits PostgREST URL limits).
      const { data: items, error: itemsError } = await supabase
        .from("order_items")
        .select("quantity, burger_id, extra_id, combo_id, customizations, burgers(default_meat_quantity, default_fries_quantity), extras(category), order_item_extras(quantity, extras(category))")
        .in("order_id", orderIds);

      if (itemsError) throw itemsError;

      let totalBurgers = 0, totalMedallones = 0, totalFries = 0, totalSides = 0, totalCombos = 0, totalDrinks = 0;

      for (const item of items ?? []) {
        if (item.extra_id) {
          // Standalone extra item (fries, sides, drink, etc. ordered as main item)
          const extra = item.extras as unknown as { category: string } | null;
          const category = extra?.category;
          if (category === "extra") totalMedallones += item.quantity;
          else if (category === "fries") totalFries += item.quantity;
          else if (category === "sides") totalSides += item.quantity;
          else if (category === "drink") totalDrinks += item.quantity;
        } else if (item.combo_id) {
          // Combo item — parse customizations JSON to get per-burger meatCount and friesQuantity
          totalCombos += item.quantity;
          try {
            const slots = JSON.parse(item.customizations ?? "[]") as Array<{
              slotType: string;
              burgers: Array<{ meatCount: number; friesQuantity: number; quantity: number }>;
            }>;
            for (const slot of slots) {
              if (slot.slotType === "burger") {
                for (const burger of slot.burgers) {
                  totalBurgers += burger.quantity * item.quantity;
                  totalMedallones += burger.meatCount * burger.quantity * item.quantity;
                  totalFries += burger.friesQuantity * burger.quantity * item.quantity;
                }
              }
            }
          } catch {
            // customizations malformed — skip
          }
        } else {
          // Regular burger item (burger_id can be null if the burger was deleted from the menu)
          const burger = item.burgers as unknown as { default_meat_quantity: number; default_fries_quantity: number } | null;
          totalBurgers += item.quantity;
          totalMedallones += item.quantity * (burger?.default_meat_quantity ?? 2);
          totalFries += item.quantity * Number(burger?.default_fries_quantity ?? 1);
        }

        // Add extras added on top of this item (embedded — no second request needed)
        const embeddedExtras = item.order_item_extras as unknown as Array<{ quantity: number; extras: { category: string } | { category: string }[] | null }> ?? [];
        for (const extraItem of embeddedExtras) {
          const extras = extraItem.extras;
          const category = Array.isArray(extras) ? extras[0]?.category : extras?.category;
          if (category === "extra") totalMedallones += extraItem.quantity;
          else if (category === "fries") totalFries += extraItem.quantity;
          else if (category === "sides") totalSides += extraItem.quantity;
          else if (category === "drink") totalDrinks += extraItem.quantity;
        }
      }

      return { totalBurgers, totalMedallones, totalFries, totalSides, totalCombos, totalDrinks };
    },
  });
}
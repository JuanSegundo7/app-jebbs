import type { Expense, ExpenseCategory, RecurringExpense } from "@/lib/types";

// Human-readable category labels — single source of truth, imported by both
// app/(dashboard)/finanzas/page.tsx and
// components/finanzas/expenses-by-category-chart.tsx, never redefined.
export const categoryLabels: Record<ExpenseCategory, string> = {
  supplies: "Insumos",
  services: "Servicios",
  salaries: "Sueldos",
  rent: "Alquiler",
  other: "Otro",
};

// Placeholder del campo Descripción en "Nuevo gasto" — un pago puntual.
// "salaries" usa el nombre del empleado ("ej: Berna") a propósito, no una
// frase tipo "sueldo de Berna": paydayProgressFor (más abajo) matchea los
// pagos con su plantilla comparando la descripción tipeada contra
// template.description de forma exacta, así que el placeholder enseña la
// convención que el propio contador de sueldos pagados necesita.
export const categoryDescriptionPlaceholder: Record<ExpenseCategory, string> = {
  supplies: "ej: compra semanal de carne",
  services: "ej: factura de luz",
  salaries: "ej: Berna",
  rent: "ej: alquiler de agosto",
  other: "Detalle del gasto",
};

// Placeholder del campo Descripción en "Nuevo gasto fijo" — el NOMBRE de una
// plantilla recurrente, no la descripción de un pago puntual. Por eso difiere
// del mapa de arriba: "Alquiler local" identifica la plantilla en sí, no un
// movimiento de un día concreto.
export const categoryTemplateDescriptionPlaceholder: Record<ExpenseCategory, string> = {
  supplies: "ej: insumo fijo mensual",
  services: "ej: Internet",
  salaries: "ej: Berna",
  rent: "ej: Alquiler local",
  other: "Nombre del gasto fijo",
};

// Fixed category -> chart color mapping (same order as categoryLabels above)
// so a given category is always the same color everywhere it appears —
// badges, KPI tile, and the category chart. Single source of truth: imported
// by both app/(dashboard)/finanzas/page.tsx and components/finanzas/
// expenses-by-category-chart.tsx, never redefined.
export const categoryChartColor: Record<ExpenseCategory, string> = {
  supplies: "var(--color-chart-1)",
  services: "var(--color-chart-2)",
  salaries: "var(--color-chart-3)",
  rent: "var(--color-chart-4)",
  other: "var(--color-chart-5)",
};

export interface RecurringExpenseAllocation {
  amount: number;
  category: ExpenseCategory;
  description: string;
}

export interface DailyRecurringAllocation {
  date: string; // YYYY-MM-DD
  amount: number;
  category: ExpenseCategory;
  description: string;
  templateId: string;
  isProrated: boolean; // always true — every row here comes from the monthly smoothed walk
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Parses a "YYYY-MM-DD" calendar date string into a UTC-midnight Date.
// Deliberately avoids `new Date("YYYY-MM-DD")` — its timezone behavior
// varies by JS engine/string format, which would poison day-count math.
// Exported so callers needing calendar-date-only math (e.g. the payday
// progress helpers below) don't redefine the same parser locally.
export function parseDateUTC(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

// Formats a UTC-midnight Date back into "YYYY-MM-DD".
function formatDateUTC(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Number of days in `month` (1-indexed) of `year`.
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// Per-day prorated rate for a MONTHLY template on one calendar day: amount
// divided by that day's own calendar month length. Only used for
// frequency === "monthly" — weekly/biweekly templates are informational-only
// and never reach this function (see expandRecurringExpensesDaily below).
function monthlyDailyRate(template: RecurringExpense, cursor: Date): number {
  const amount = Number(template.amount);
  const year = cursor.getUTCFullYear();
  const month = cursor.getUTCMonth() + 1;
  return amount / daysInMonth(year, month);
}

// Raw payday grid dates: every `intervalDays` days starting from
// `anchorDate`, filtered to those falling within [windowStart, windowEnd]
// (inclusive both ends). Used by previewPaydayDates (dates only, for the UI
// before a template is saved) to render the informational "Se paga todos
// los X" preview text — weekly/biweekly templates no longer generate any
// ledger rows, so this is purely a display helper now.
//
// Precondition: callers that already know their window starts on/after the
// anchor can pass windowStart >= anchorDate directly. The UI preview does
// NOT have that guarantee — it asks for "this month's paydays" and the
// month can start before the salary's own start date (e.g. salary starts
// Aug 5, preview window is Aug 1-31). This function must handle windowStart
// being BEFORE anchorDate: clamp to the anchor itself as the first
// candidate, don't assume `daysSinceAnchor >= 0`.
function walkOccurrenceGrid(
  anchorDate: Date,
  intervalDays: number,
  windowStart: Date,
  windowEnd: Date
): Date[] {
  const dates: Date[] = [];
  const daysSinceAnchor = Math.round(
    (windowStart.getTime() - anchorDate.getTime()) / MS_PER_DAY
  );
  const firstK = daysSinceAnchor <= 0 ? 0 : Math.ceil(daysSinceAnchor / intervalDays);
  let occurrence = new Date(anchorDate.getTime() + firstK * intervalDays * MS_PER_DAY);

  while (occurrence.getTime() <= windowEnd.getTime()) {
    if (occurrence.getTime() >= windowStart.getTime()) {
      dates.push(occurrence);
    }
    occurrence = new Date(occurrence.getTime() + intervalDays * MS_PER_DAY);
  }

  return dates;
}

// Payday dates only (no amount/category) — for the UI to preview upcoming
// paydays before a weekly/biweekly template is saved.
export function previewPaydayDates(
  startDate: string, // YYYY-MM-DD
  intervalDays: number, // 7 or 15
  windowStart: Date,
  windowEnd: Date
): string[] {
  const anchor = parseDateUTC(startDate);
  return walkOccurrenceGrid(anchor, intervalDays, windowStart, windowEnd).map(formatDateUTC);
}

// UTC-midnight bounds of the calendar month containing `dateStr`.
export function monthWindowFor(dateStr: string): { start: Date; end: Date } {
  const [year, month] = dateStr.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month - 1, daysInMonth(year, month)));
  return { start, end };
}

/**
 * Expands recurring expense templates into allocation rows within the
 * period. Only `monthly` templates ever produce rows: they walk every
 * calendar day in the overlap range and emit one smoothed row per day via
 * `monthlyDailyRate` (amount / daysInMonth of that day's own month).
 *
 * `weekly`/`biweekly` templates are informational-only (see
 * `previewPaydayDates` for their UI preview text) — an hourly-paid
 * employee's actual weekly amount isn't known in advance, so these
 * templates carry no reliable `amount` and are skipped entirely here. The
 * real payment, once known, is logged by the user as a one-off `expenses`
 * row instead. Skipping them also prevents double-counting: if a template
 * happened to carry a leftover amount, it must still never contribute to
 * the ledger since the one-off row is the source of truth for that payment.
 *
 * This is the primitive: `expandRecurringExpenses` derives its per-template
 * period totals by summing this function's output, so the two can never
 * drift out of sync with each other.
 *
 * `periodStart`/`periodEnd` must be UTC-midnight Dates representing pure
 * calendar dates (inclusive bounds) — not instants with time-of-day info.
 */
export function expandRecurringExpensesDaily(
  templates: RecurringExpense[],
  periodStart: Date,
  periodEnd: Date
): DailyRecurringAllocation[] {
  const allocations: DailyRecurringAllocation[] = [];

  for (const template of templates) {
    const templateStart = parseDateUTC(template.start_date);
    const templateEnd = template.end_date ? parseDateUTC(template.end_date) : null;

    const overlaps =
      templateStart.getTime() <= periodEnd.getTime() &&
      (templateEnd === null || templateEnd.getTime() >= periodStart.getTime());

    if (!overlaps) continue;

    const overlapStart =
      templateStart.getTime() > periodStart.getTime() ? templateStart : periodStart;
    const overlapEnd =
      templateEnd !== null && templateEnd.getTime() < periodEnd.getTime()
        ? templateEnd
        : periodEnd;

    if (overlapStart.getTime() > overlapEnd.getTime()) continue;

    // Only monthly templates generate ledger rows — weekly/biweekly are
    // informational-only (see doc comment above) and never reach the ledger.
    if (template.frequency !== "monthly") continue;

    let cursor = overlapStart;

    while (cursor.getTime() <= overlapEnd.getTime()) {
      allocations.push({
        date: formatDateUTC(cursor),
        amount: monthlyDailyRate(template, cursor),
        category: template.category,
        description: template.description,
        templateId: template.id,
        isProrated: true,
      });

      cursor = new Date(cursor.getTime() + MS_PER_DAY);
    }
  }

  return allocations;
}

/**
 * Expands recurring expense templates into their prorated contribution for
 * a given period, using calendar-month day counts (not period-length days).
 * A template that spans multiple calendar months within the period has each
 * month's portion prorated against that month's own day count.
 *
 * Derived from `expandRecurringExpensesDaily` by summing per-template daily
 * allocations, grouped by template id (never by description/category —
 * two different templates could share those and would otherwise get merged
 * into a single output row) and in first-seen order, so the two functions
 * can't disagree about a template's period total.
 *
 * `periodStart`/`periodEnd` must be UTC-midnight Dates representing pure
 * calendar dates (inclusive bounds) — not instants with time-of-day info.
 */
export function expandRecurringExpenses(
  templates: RecurringExpense[],
  periodStart: Date,
  periodEnd: Date
): RecurringExpenseAllocation[] {
  const daily = expandRecurringExpensesDaily(templates, periodStart, periodEnd);

  const order: string[] = [];
  const byTemplate: Record<
    string,
    { amount: number; category: ExpenseCategory; description: string }
  > = {};

  for (const allocation of daily) {
    if (!byTemplate[allocation.templateId]) {
      byTemplate[allocation.templateId] = {
        amount: 0,
        category: allocation.category,
        description: allocation.description,
      };
      order.push(allocation.templateId);
    }
    byTemplate[allocation.templateId].amount += allocation.amount;
  }

  return order.map((templateId) => ({
    amount: byTemplate[templateId].amount,
    category: byTemplate[templateId].category,
    description: byTemplate[templateId].description,
  }));
}

// ─── Payday progress (weekly/biweekly informational templates) ────────────

export interface PaydayProgress {
  loaded: number;
  expected: number;
}

// A weekly/biweekly template that is still ACTIVE is "informational": it
// never generates ledger rows (see expandRecurringExpensesDaily above), it
// only declares a payment cadence. The real amount is logged later as a
// one-off `expenses` row. Deliberately does NOT check `amount == null` —
// expandRecurringExpensesDaily already skips every non-monthly template
// regardless of its `amount`, so a legacy weekly row carrying a leftover
// amount (e.g. from before amount became nullable) can't double-count
// money either way. Gating the progress counter on `amount == null` too
// would just make that legacy row invisible everywhere, with no upside.
export function isInformationalPaydayTemplate(template: RecurringExpense): boolean {
  return (
    template.end_date == null &&
    (template.frequency === "weekly" || template.frequency === "biweekly")
  );
}

// Payday completion for ONE template within [windowStart, windowEnd]:
// `expected` = paydays the template's cadence grid lands on inside the
// window; `loaded` = one-off "salaries" expenses whose description matches
// the template, inside the same window. Matching by description (not a
// foreign key — none exists) means editing the description on a logged
// payment breaks the join; that's a pre-existing tradeoff, not new here.
export function paydayProgressFor(
  template: RecurringExpense,
  expenses: Expense[] | undefined,
  windowStart: Date,
  windowEnd: Date
): PaydayProgress {
  const intervalDays = template.frequency === "weekly" ? 7 : 15;
  const expected = previewPaydayDates(
    template.start_date,
    intervalDays,
    windowStart,
    windowEnd
  ).length;
  const loaded =
    expenses?.filter(
      (e) => e.category === "salaries" && e.description === template.description
    ).length ?? 0;
  return { loaded, expected };
}

// Sum of paydayProgressFor over every informational template. Returns
// `null` when there are none, so the caller can tell "no weekly/biweekly
// templates configured" apart from "configured but zero paydays this
// window" — the former should hide the counter, the latter should show
// "0 de 0".
export function aggregatePaydayProgress(
  templates: RecurringExpense[] | undefined,
  expenses: Expense[] | undefined,
  windowStart: Date,
  windowEnd: Date
): PaydayProgress | null {
  const informational = (templates ?? []).filter(isInformationalPaydayTemplate);
  if (informational.length === 0) return null;

  return informational.reduce<PaydayProgress>(
    (total, template) => {
      const progress = paydayProgressFor(template, expenses, windowStart, windowEnd);
      return {
        loaded: total.loaded + progress.loaded,
        expected: total.expected + progress.expected,
      };
    },
    { loaded: 0, expected: 0 }
  );
}

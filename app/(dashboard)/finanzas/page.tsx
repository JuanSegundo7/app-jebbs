"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useNextStep } from "nextstepjs";
import { Header } from "@/components/layout/header";
import { HelpButton } from "@/components/onboarding/help-button";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Plus, Trash2, Pencil, CalendarIcon, ChevronLeft, ChevronRight, RefreshCcw } from "lucide-react";
import {
  useExpenses,
  useCreateExpense,
  useUpdateExpense,
  useDeleteExpense,
  useRecurringExpenses,
  useCreateRecurringExpense,
  useCloseAndReplaceRecurringExpense,
  useDeleteRecurringExpense,
  isStockUpdateFailure,
  isStockRevertFailure,
  isStockAdjustFailure,
} from "@/lib/hooks/use-expenses";
import { useOrdersAnalytics } from "@/lib/hooks/orders/use-orders-history";
import { useSupplies } from "@/lib/hooks/use-supplies";
import { usePeriodSelector, TZ } from "@/lib/hooks/use-period-selector";
import { PeriodSelector } from "@/components/shared/period-selector";
import { NetRevenueCard } from "@/components/finanzas/net-revenue-card";
import { DailyLedger } from "@/components/finanzas/daily-ledger";
import { GastosSummaryRow } from "@/components/finanzas/gastos-summary-row";
import { ExpensesByCategoryChart } from "@/components/finanzas/expenses-by-category-chart";
import {
  DailyIncomeVsExpensesChart,
  type DailyIncomeVsExpenseRow,
} from "@/components/finanzas/daily-income-vs-expenses-chart";
import { CostosSummaryRow } from "@/components/costos/costos-summary-row";
import { SuppliesTab } from "@/components/costos/supplies-tab";
import { RecipesTab } from "@/components/costos/recipes-tab";
import {
  SupplyQuantityInput,
  resolveSupplyQuantity,
  type SupplyQuantityMode,
} from "@/components/costos/supply-quantity-input";
import type {
  Expense,
  ExpenseCategory,
  RecurringExpense,
  RecurringExpenseFrequency,
} from "@/lib/types";
import { formatCurrency } from "@/lib/utils/format";
import {
  previewPaydayDates,
  monthWindowFor,
  categoryChartColor,
  categoryLabels,
  categoryDescriptionPlaceholder,
  categoryTemplateDescriptionPlaceholder,
  parseDateUTC,
  isInformationalPaydayTemplate,
  paydayProgressFor,
  aggregatePaydayProgress,
} from "@/lib/utils/expenses";

const PAGE_SIZE = 8;

type FinanzasTab = "resumen" | "gastos" | "insumos" | "recetas";
type GastosSubTab = "period" | "recurring";

function isFinanzasTab(value: string | null): value is FinanzasTab {
  return value === "resumen" || value === "gastos" || value === "insumos" || value === "recetas";
}

const frequencyLabels: Record<RecurringExpenseFrequency, string> = {
  weekly: "Semanal",
  biweekly: "Quincenal",
  monthly: "Mensual",
};
const frequencySuffix: Record<RecurringExpenseFrequency, string> = {
  weekly: "/semana",
  biweekly: "/quincena",
  monthly: "/mes",
};

// "cada semana"/"cada quincena" phrasing for the amount-input replacement
// text below — frequencyLabels holds adjective forms ("Semanal",
// "Quincenal") which read wrong in "se carga cada semanal"; this map holds
// the noun form the sentence actually needs. Only weekly/biweekly ever hit
// this text (monthly keeps its amount input), so monthly isn't listed here.
const recurringPeriodNoun: Record<"weekly" | "biweekly", string> = {
  weekly: "semana",
  biweekly: "quincena",
};

function toArStr(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: TZ });
}

function todayArStr(): string {
  return toArStr(new Date());
}

function formatDisplayDate(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// Informational preview shown below the Frecuencia select in the create and
// update recurring-template dialogs. Only weekly/biweekly have discrete
// paydays to preview — monthly stays smoothed, no preview for it. Weekly
// and biweekly are worded asymmetrically on purpose: a weekly payday always
// lands on the same weekday (7 has no remainder mod 7), so naming it is
// accurate; a biweekly payday's weekday drifts by one day every occurrence
// (15 days = 2 weeks + 1 day), so claiming a fixed weekday would be wrong.
function paydayPreviewText(
  startDate: string,
  frequency: RecurringExpenseFrequency,
  // Which month's window to preview — defaults to startDate's own month
  // (dialog use case: previewing relative to whatever date you're picking).
  // The list row passes today's date instead, so an already-active template
  // shows THIS month's actual payday count, not the month it happened to
  // start in.
  referenceDate: string = startDate
): string | null {
  if (frequency !== "weekly" && frequency !== "biweekly") return null;

  const intervalDays = frequency === "weekly" ? 7 : 15;
  const window = monthWindowFor(referenceDate);
  const occurrences = previewPaydayDates(startDate, intervalDays, window.start, window.end);

  if (frequency === "weekly") {
    const weekday = new Date(startDate + "T12:00:00").toLocaleDateString("es-AR", {
      weekday: "long",
      timeZone: TZ,
    });
    return `Se paga todos los ${weekday} · ${occurrences.length} pagos este mes`;
  }

  return `Se paga cada 15 días desde el ${formatDisplayDate(startDate)} · ${occurrences.length} pagos este mes`;
}

// One calendar day before `dateStr` (both plain YYYY-MM-DD calendar dates,
// no AR-local instant conversion needed here).
function dayBeforeStr(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export default function FinanzasPage() {
  return (
    <Suspense fallback={<FinanzasPageSkeleton />}>
      <FinanzasPageContent />
    </Suspense>
  );
}

function FinanzasPageSkeleton() {
  return (
    <section className="flex flex-1 min-h-0 flex-col">
      <div className="flex-1 overflow-auto py-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="mt-4 h-24" />
      </div>
    </section>
  );
}

function FinanzasPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabFromUrl = searchParams.get("tab");
  const [tab, setTab] = useState<FinanzasTab>(
    isFinanzasTab(tabFromUrl) ? tabFromUrl : "resumen"
  );
  const [gastosSubTab, setGastosSubTab] = useState<GastosSubTab>("period");

  // Keeps the URL's `?tab=` in sync (deep-link support, and the target for
  // the /gastos and /costos redirects) — router.replace so it doesn't grow
  // the browser history stack on every tab click.
  function goToTab(next: FinanzasTab) {
    setTab(next);
    router.replace(`/finanzas?tab=${next}`, { scroll: false });
  }

  // Radix Tabs unmounts inactive TabsContent by default, so a tour step
  // targeting an element inside another tab needs that tab mounted first.
  // This syncs this page's tab state to whichever step of the active tour
  // is currently showing. The "gastos" and "costos" tours stay separate
  // (see components/onboarding/tours.tsx) — merging them into one tour id
  // would require components/costos/recipes-tab.tsx to know about the new
  // id too, and that file is reused as-is. A single HelpButton below picks
  // whichever tour matches the active tab instead.
  const { currentTour, currentStep } = useNextStep();
  useEffect(() => {
    if (currentTour === "gastos") {
      if (currentStep <= 3) {
        setTab("gastos");
        setGastosSubTab(currentStep <= 1 ? "period" : "recurring");
      } else {
        setTab("resumen");
      }
    } else if (currentTour === "costos") {
      setTab(currentStep <= 4 ? "insumos" : "recetas");
    }
  }, [currentTour, currentStep]);

  const activeTour = tab === "insumos" || tab === "recetas" ? "costos" : "gastos";

  // ── Shared period selector (Resumen + Gastos tabs only) ──
  const period = usePeriodSelector();
  const { startDate, endDate, periodLabel } = period;

  // ── Resumen tab (financial hub summary — heavy query gated to this tab) ──
  const { data: analytics, isLoading: analyticsLoading } = useOrdersAnalytics(
    period.selectedDate,
    period.viewMode,
    period.customRange,
    tab === "resumen"
  );

  // ── One-off expenses ──
  const { data: expenses, isLoading: expensesLoading } = useExpenses(startDate, endDate);
  const createExpense = useCreateExpense(startDate, endDate);
  const updateExpense = useUpdateExpense(startDate, endDate);
  const deleteExpense = useDeleteExpense(startDate, endDate);

  // This month's expenses, scoped to the real current calendar month
  // (independent of whatever period "Del período" happens to be viewing) —
  // used to count how many one-off salary payments have already been logged
  // against each weekly/biweekly recurring template below.
  const thisMonthWindow = monthWindowFor(todayArStr());
  const thisMonthStart = thisMonthWindow.start.toISOString().slice(0, 10);
  const thisMonthEnd = thisMonthWindow.end.toISOString().slice(0, 10);
  const { data: thisMonthExpenses } = useExpenses(thisMonthStart, thisMonthEnd);

  const [expensePage, setExpensePage] = useState(1);
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [expenseCalendarOpen, setExpenseCalendarOpen] = useState(false);
  const [expenseDate, setExpenseDate] = useState<string>(todayArStr());
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseCategory, setExpenseCategory] = useState<ExpenseCategory>("supplies");
  const [expenseDescription, setExpenseDescription] = useState("");
  const [expenseSupplyId, setExpenseSupplyId] = useState<string | null>(null);
  const [expenseSupplyQuantity, setExpenseSupplyQuantity] = useState("");
  const [expenseSupplyMode, setExpenseSupplyMode] = useState<SupplyQuantityMode>("native");
  const [deletingExpense, setDeletingExpense] = useState<Expense | null>(null);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  const { data: supplies } = useSupplies();
  const activeSupplies = useMemo(() => supplies?.filter((s) => s.is_active) ?? [], [supplies]);
  const selectedExpenseSupply = activeSupplies.find((s) => s.id === expenseSupplyId) ?? null;
  // Hoisted to render scope (not just inside handleCreateExpense) so the
  // dialog can show, before the user hits Guardar, whether this expense is
  // actually going to touch stock — an unresolved quantity here used to
  // save silently without ever telling the user their stock link was a
  // no-op.
  const resolvedExpenseSupplyQuantity = selectedExpenseSupply
    ? resolveSupplyQuantity(selectedExpenseSupply, expenseSupplyQuantity, expenseSupplyMode)
    : null;

  // NOTE: this total only sums the one-off `expenses` rows in the period —
  // it deliberately does NOT match `analytics.expensesTotal` (the Resumen
  // KPI), which also prorates recurring monthly templates day-by-day. Two
  // different calculations, so the label below says so explicitly instead
  // of implying they're the same number.
  const oneOffExpensesTotal = expenses?.reduce((acc, e) => acc + Number(e.amount), 0) ?? 0;
  const expenseTotalPages = Math.ceil((expenses?.length ?? 0) / PAGE_SIZE);
  const paginatedExpenses = expenses?.slice((expensePage - 1) * PAGE_SIZE, expensePage * PAGE_SIZE) ?? [];

  function resetExpenseForm() {
    setExpenseDate(todayArStr());
    setExpenseAmount("");
    setExpenseCategory("supplies");
    setExpenseDescription("");
    setExpenseSupplyId(null);
    setExpenseSupplyQuantity("");
    setExpenseSupplyMode("native");
    setEditingExpense(null);
  }

  // Prefills the same dialog/form used for "Nuevo gasto" from an existing
  // row. The supply quantity is always prefilled in "native" mode: it's
  // already the resolved (native-unit) value stored on the expense, not a
  // per-kilo entry the user typed — showing it any other way would silently
  // re-convert it on save.
  function openEditExpense(expense: Expense) {
    setEditingExpense(expense);
    setExpenseDate(expense.date);
    setExpenseAmount(String(expense.amount));
    setExpenseCategory(expense.category);
    setExpenseDescription(expense.description ?? "");
    setExpenseSupplyId(expense.supply_id ?? null);
    setExpenseSupplyQuantity(expense.quantity != null ? String(expense.quantity) : "");
    setExpenseSupplyMode("native");
    setExpenseDialogOpen(true);
  }

  async function handleCreateExpense() {
    const parsed = parseFloat(expenseAmount.replace(",", "."));
    if (isNaN(parsed) || parsed <= 0) return;

    // Stock is only bumped when the user both picked a supply and entered a
    // valid quantity — an invalid/empty quantity still saves the expense,
    // just without touching stock (same "don't block on this" precedent as
    // the Insumos tab's own stock fields). resolveSupplyQuantity already
    // converts kilos mode down to the supply's native unit, which is what
    // gets persisted — same contract the Insumos tab's restock popover uses.
    const hasSupplyQuantity =
      expenseCategory === "supplies" && !!expenseSupplyId && !!resolvedExpenseSupplyQuantity;

    try {
      await createExpense.mutateAsync({
        date: expenseDate,
        amount: parsed,
        category: expenseCategory,
        description: expenseDescription.trim() || null,
        supply_id: hasSupplyQuantity ? expenseSupplyId : null,
        quantity: hasSupplyQuantity ? resolvedExpenseSupplyQuantity : null,
      });
      toast.success("Gasto registrado");
      setExpenseDialogOpen(false);
      resetExpenseForm();
    } catch (error) {
      if (isStockUpdateFailure(error)) {
        toast.error("El gasto se registró, pero no se pudo actualizar el stock. Corregilo desde Insumos.");
        setExpenseDialogOpen(false);
        resetExpenseForm();
      } else {
        toast.error("Error al registrar el gasto");
      }
    }
  }

  async function handleUpdateExpense() {
    if (!editingExpense) return;
    const parsed = parseFloat(expenseAmount.replace(",", "."));
    if (isNaN(parsed) || parsed <= 0) return;

    const hasSupplyQuantity =
      expenseCategory === "supplies" && !!expenseSupplyId && !!resolvedExpenseSupplyQuantity;

    try {
      await updateExpense.mutateAsync({
        id: editingExpense.id,
        date: expenseDate,
        amount: parsed,
        category: expenseCategory,
        description: expenseDescription.trim() || null,
        supply_id: hasSupplyQuantity ? expenseSupplyId : null,
        quantity: hasSupplyQuantity ? resolvedExpenseSupplyQuantity : null,
      });
      toast.success("Gasto actualizado");
      setExpenseDialogOpen(false);
      resetExpenseForm();
    } catch (error) {
      if (isStockAdjustFailure(error)) {
        toast.error("El gasto se actualizó, pero no se pudo ajustar el stock. Corregilo desde Insumos.");
        setExpenseDialogOpen(false);
        resetExpenseForm();
      } else {
        toast.error("Error al actualizar el gasto");
      }
    }
  }

  async function handleDeleteExpense() {
    if (!deletingExpense) return;
    try {
      await deleteExpense.mutateAsync(deletingExpense.id);
      toast.success("Gasto eliminado");
    } catch (error) {
      if (isStockRevertFailure(error)) {
        toast.error("El gasto se eliminó, pero no se pudo actualizar el stock. Corregilo desde Insumos.");
      } else {
        toast.error("Error al eliminar el gasto");
      }
    } finally {
      setDeletingExpense(null);
    }
  }

  // ── Recurring expenses (fixed monthly templates) ──
  const { data: recurringExpenses, isLoading: recurringLoading } = useRecurringExpenses();
  const createRecurring = useCreateRecurringExpense();
  const closeAndReplace = useCloseAndReplaceRecurringExpense();
  const deleteRecurring = useDeleteRecurringExpense();

  const [recurringDialogOpen, setRecurringDialogOpen] = useState(false);
  const [recurringCalendarOpen, setRecurringCalendarOpen] = useState(false);
  const [recurringStartDate, setRecurringStartDate] = useState<string>(todayArStr());
  const [recurringAmount, setRecurringAmount] = useState("");
  const [recurringCategory, setRecurringCategory] = useState<ExpenseCategory>("rent");
  const [recurringFrequency, setRecurringFrequency] =
    useState<RecurringExpenseFrequency>("monthly");
  const [recurringDescription, setRecurringDescription] = useState("");

  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [updateCalendarOpen, setUpdateCalendarOpen] = useState(false);
  const [updatingTemplate, setUpdatingTemplate] = useState<RecurringExpense | null>(null);
  const [updateAmount, setUpdateAmount] = useState("");
  const [updateFrequency, setUpdateFrequency] =
    useState<RecurringExpenseFrequency>("monthly");
  const [updateStartDate, setUpdateStartDate] = useState<string>(todayArStr());

  const [deletingRecurring, setDeletingRecurring] = useState<RecurringExpense | null>(null);

  function resetRecurringForm() {
    setRecurringStartDate(todayArStr());
    setRecurringAmount("");
    setRecurringCategory("rent");
    setRecurringFrequency("monthly");
    setRecurringDescription("");
  }

  async function handleCreateRecurring() {
    const isMonthly = recurringFrequency === "monthly";
    const parsed = parseFloat(recurringAmount.replace(",", "."));
    if (isMonthly && (isNaN(parsed) || parsed <= 0)) return;
    if (!recurringDescription.trim()) return;

    try {
      await createRecurring.mutateAsync({
        amount: isMonthly ? parsed : null,
        category: recurringCategory,
        frequency: recurringFrequency,
        description: recurringDescription.trim(),
        start_date: recurringStartDate,
        end_date: null,
      });
      toast.success("Gasto fijo creado");
      setRecurringDialogOpen(false);
      resetRecurringForm();
    } catch {
      toast.error("Error al crear el gasto fijo");
    }
  }

  function openUpdateDialog(template: RecurringExpense) {
    setUpdatingTemplate(template);
    setUpdateAmount(template.amount != null ? template.amount.toString() : "");
    setUpdateFrequency(template.frequency);
    setUpdateStartDate(todayArStr());
    setUpdateDialogOpen(true);
  }

  async function handleUpdateRecurring() {
    if (!updatingTemplate) return;
    const isMonthly = updateFrequency === "monthly";
    const parsed = parseFloat(updateAmount.replace(",", "."));
    if (isMonthly && (isNaN(parsed) || parsed <= 0)) return;

    try {
      await closeAndReplace.mutateAsync({
        closeId: updatingTemplate.id,
        closeEndDate: dayBeforeStr(updateStartDate),
        newExpense: {
          amount: isMonthly ? parsed : null,
          category: updatingTemplate.category,
          frequency: updateFrequency,
          description: updatingTemplate.description,
          start_date: updateStartDate,
        },
      });
      toast.success("Gasto fijo actualizado: se cerró el anterior y se creó uno nuevo");
      setUpdateDialogOpen(false);
      setUpdatingTemplate(null);
    } catch {
      toast.error("Error al actualizar el monto");
    }
  }

  // Opens the "Nuevo gasto" dialog (owned by the "Del período" sub-tab)
  // prefilled with this template's description/category, so logging this
  // week's/fortnight's salary payment doesn't require retyping it from
  // scratch. Switches to the "Del período" sub-tab so the user lands where
  // the newly-logged payment becomes visible after saving.
  function handleQuickLogPayment(template: RecurringExpense) {
    setExpenseDate(todayArStr());
    setExpenseCategory("salaries");
    setExpenseDescription(template.description);
    setExpenseAmount("");
    goToTab("gastos");
    setGastosSubTab("period");
    setExpenseDialogOpen(true);
  }

  async function handleDeleteRecurring() {
    if (!deletingRecurring) return;
    try {
      await deleteRecurring.mutateAsync(deletingRecurring.id);
      toast.success("Gasto fijo eliminado");
    } catch {
      toast.error("Error al eliminar el gasto fijo");
    } finally {
      setDeletingRecurring(null);
    }
  }

  const recurringPaydayPreview = paydayPreviewText(recurringStartDate, recurringFrequency);
  const updatePaydayPreview = paydayPreviewText(updateStartDate, updateFrequency);

  // ── Resumen tab: KPI row + charts derived data (no new fetches — all from
  // `analytics`, `recurringExpenses`, `thisMonthExpenses`, already above) ──

  // Highest-spend category this period, for the "Categoría con más gasto"
  // tile. Zero-amount categories never win (all-zero => null, tile shows
  // "—" instead of crashing).
  const topCategory = useMemo(() => {
    const byCategory = analytics?.expensesByCategory;
    if (!byCategory) return null;
    let best: { category: ExpenseCategory; amount: number } | null = null;
    for (const category of Object.keys(byCategory) as ExpenseCategory[]) {
      const amount = byCategory[category];
      if (amount > 0 && (!best || amount > best.amount)) {
        best = { category, amount };
      }
    }
    if (!best) return null;
    return {
      label: categoryLabels[best.category],
      amount: best.amount,
      color: categoryChartColor[best.category],
    };
  }, [analytics?.expensesByCategory]);

  // Payday completion for the "Sueldos" KPI tile, measured over the
  // SELECTED PERIOD (not the real calendar month) so the counter always
  // agrees with the peso amount shown right next to it in the same card —
  // mixing two different time windows inside one card would make the
  // numbers not add up when viewing e.g. a single week.
  const salariesProgress = useMemo(
    () =>
      aggregatePaydayProgress(
        recurringExpenses,
        expenses,
        parseDateUTC(startDate),
        parseDateUTC(endDate)
      ),
    [recurringExpenses, expenses, startDate, endDate]
  );

  // Daily income vs. expense series for the chart, grouped from
  // `analytics.ledger` client-side (ledger already carries date/kind/amount
  // per movement — no new query). Sum of `income` across days must equal
  // `analytics.totalRevenue`, and sum of `expense` must equal
  // `analytics.expensesTotal` (verified by hand during implementation).
  const dailyIncomeVsExpense = useMemo<DailyIncomeVsExpenseRow[]>(() => {
    const byDate = new Map<string, DailyIncomeVsExpenseRow>();
    for (const entry of analytics?.ledger ?? []) {
      let row = byDate.get(entry.date);
      if (!row) {
        row = { date: entry.date, income: 0, expense: 0 };
        byDate.set(entry.date, row);
      }
      if (entry.kind === "income") row.income += entry.amount;
      else row.expense += entry.amount;
    }
    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [analytics?.ledger]);

  return (
    <section className="flex flex-1 min-h-0 flex-col">
      <Header
        title="Finanzas"
        subtitle="Gastos, insumos y recetas"
        extraActions={<HelpButton tour={activeTour} />}
      />

      <div className="flex-1 overflow-auto py-4">
        <Tabs value={tab} onValueChange={(v) => goToTab(v as FinanzasTab)}>
          <TabsList id="finanzas-tabs-list" className="rounded-full p-1">
            <TabsTrigger value="resumen" className="rounded-full px-6 text-subheadline">
              Resumen
            </TabsTrigger>
            <TabsTrigger value="gastos" className="rounded-full px-6 text-subheadline">
              Gastos
            </TabsTrigger>
            <TabsTrigger value="insumos" id="costos-tab-supplies" className="rounded-full px-6 text-subheadline">
              Insumos
            </TabsTrigger>
            <TabsTrigger value="recetas" id="costos-tab-recipes" className="rounded-full px-6 text-subheadline">
              Recetas
            </TabsTrigger>
          </TabsList>

          {/* Period selector — shared by Resumen and Gastos, hidden for
              Insumos/Recetas on purpose: those tabs have no time dimension. */}
          {(tab === "resumen" || tab === "gastos") && (
            <PeriodSelector period={period} className="mt-4" />
          )}

          {/* ─── Resumen ─── */}
          <TabsContent value="resumen" className="mt-4">
            <div>
              <GastosSummaryRow
                isLoading={analyticsLoading}
                expensesTotal={analytics?.expensesTotal ?? 0}
                netRevenue={analytics?.netRevenue ?? 0}
                topCategory={topCategory}
                salariesTotal={analytics?.expensesByCategory?.salaries ?? 0}
                salariesProgress={salariesProgress}
              />
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <ExpensesByCategoryChart
                data={analytics?.expensesByCategory}
                isLoading={analyticsLoading}
              />
              <DailyIncomeVsExpensesChart
                dailyData={dailyIncomeVsExpense}
                isLoading={analyticsLoading}
              />
            </div>

            <div className="mt-4" id="gastos-ledger-summary">
              <NetRevenueCard
                grossRevenue={analytics?.totalRevenue ?? 0}
                expensesTotal={analytics?.expensesTotal ?? 0}
                commissionTotal={analytics?.commissionTotal ?? 0}
                netRevenue={analytics?.netRevenue ?? 0}
                isLoading={analyticsLoading}
              />
            </div>

            <div id="gastos-ledger-table-card">
              <DailyLedger
                entries={analytics?.ledger}
                closingBalance={analytics?.netRevenue ?? 0}
                isLoading={analyticsLoading}
                periodLabel={periodLabel}
                startDate={startDate}
                endDate={endDate}
              />
            </div>
          </TabsContent>

          {/* ─── Gastos (agrupa "Del período" + "Fijos mensuales") ─── */}
          <TabsContent value="gastos" className="mt-4">
            <Tabs value={gastosSubTab} onValueChange={(v) => setGastosSubTab(v as GastosSubTab)}>
              <TabsList className="rounded-full p-0.5 h-8">
                <TabsTrigger value="period" className="rounded-full px-3 text-caption">
                  Del período
                </TabsTrigger>
                <TabsTrigger value="recurring" className="rounded-full px-3 text-caption">
                  Fijos mensuales
                </TabsTrigger>
              </TabsList>

              {/* ─── Del período (period selector lives at page level now) ─── */}
              <TabsContent value="period" className="mt-3">
                <Card id="gastos-period-card">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-subheadline font-medium">Gastos puntuales cargados</p>
                      <div className="flex items-center gap-3">
                        <span className="text-callout numeric vibrant font-medium">
                          {formatCurrency(oneOffExpensesTotal)}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 gap-1.5 text-caption"
                          onClick={() => setExpenseDialogOpen(true)}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Agregar
                        </Button>
                      </div>
                    </div>

                    {expensesLoading ? (
                      <div className="space-y-2">
                        <Skeleton className="h-10" />
                        <Skeleton className="h-10" />
                        <Skeleton className="h-10" />
                      </div>
                    ) : !expenses || expenses.length === 0 ? (
                      <p className="text-subheadline text-muted-foreground text-center py-4">
                        Sin gastos en este período
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {paginatedExpenses.map((expense) => (
                          <div
                            key={expense.id}
                            className="flex items-center gap-3 rounded-xl material-well px-4 py-2.5 transition-colors hover:bg-[var(--material-thin)]"
                          >
                            <span className="text-caption text-muted-foreground w-20 shrink-0">
                              {formatDisplayDate(expense.date)}
                            </span>
                            <Badge variant="outline" className="text-caption shrink-0">
                              <span
                                className="h-1.5 w-1.5 rounded-full shrink-0"
                                style={{ backgroundColor: categoryChartColor[expense.category] }}
                              />
                              {categoryLabels[expense.category]}
                            </Badge>
                            <span className="flex-1 text-subheadline text-muted-foreground truncate">
                              {expense.description ?? "—"}
                            </span>
                            <span className="text-callout numeric vibrant font-medium">
                              {formatCurrency(expense.amount)}
                            </span>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-muted-foreground shrink-0"
                              onClick={() => openEditExpense(expense)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                              onClick={() => setDeletingExpense(expense)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ))}

                        {expenseTotalPages > 1 && (
                          <div className="flex items-center justify-between pt-1 px-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => setExpensePage((p) => Math.max(1, p - 1))}
                              disabled={expensePage === 1}
                            >
                              <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <span className="text-caption text-muted-foreground">
                              {expensePage} / {expenseTotalPages}
                            </span>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => setExpensePage((p) => Math.min(expenseTotalPages, p + 1))}
                              disabled={expensePage === expenseTotalPages}
                            >
                              <ChevronRight className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ─── Fijos mensuales ─── */}
              <TabsContent value="recurring" className="mt-3">
                <Card id="gastos-recurring-card">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-subheadline font-medium">Gastos fijos mensuales</p>
                      <Button
                        id="gastos-add-recurring-button"
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1.5 text-caption"
                        onClick={() => setRecurringDialogOpen(true)}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Agregar
                      </Button>
                    </div>

                    {recurringLoading ? (
                      <div className="space-y-2">
                        <Skeleton className="h-16" />
                        <Skeleton className="h-16" />
                      </div>
                    ) : !recurringExpenses || recurringExpenses.length === 0 ? (
                      <p className="text-subheadline text-muted-foreground text-center py-4">
                        No hay gastos fijos configurados
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {recurringExpenses.map((template) => {
                          const isActive = template.end_date == null;
                          // Weekly/biweekly informational templates get a
                          // "loaded this month" counter + quick-log button —
                          // monthly templates don't (paydayPreviewText itself
                          // returns null for monthly, so this mirrors that
                          // same gate). Also gated on isActive: a closed
                          // template (employee no longer paid) shouldn't
                          // prompt you to log a payment for it.
                          const isInformationalPayday = isInformationalPaydayTemplate(template);
                          const progress = isInformationalPayday
                            ? paydayProgressFor(
                                template,
                                thisMonthExpenses,
                                thisMonthWindow.start,
                                thisMonthWindow.end
                              )
                            : null;
                          return (
                            <div
                              key={template.id}
                              className="flex flex-col gap-2 rounded-xl material-well px-4 py-3 sm:flex-row sm:items-center sm:justify-between transition-colors hover:bg-[var(--material-thin)]"
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-subheadline font-medium truncate">
                                    {template.description}
                                  </span>
                                  <Badge variant="outline" className="text-caption shrink-0">
                                    <span
                                      className="h-1.5 w-1.5 rounded-full shrink-0"
                                      style={{ backgroundColor: categoryChartColor[template.category] }}
                                    />
                                    {categoryLabels[template.category]}
                                  </Badge>
                                  <Badge variant="outline" className="text-caption shrink-0">
                                    {frequencyLabels[template.frequency]}
                                  </Badge>
                                  <Badge
                                    variant={isActive ? "default" : "secondary"}
                                    className="text-caption shrink-0"
                                  >
                                    {isActive ? "Activo" : `Cerrado el ${formatDisplayDate(template.end_date!)}`}
                                  </Badge>
                                </div>
                                <p className="text-caption text-muted-foreground mt-0.5">
                                  Desde {formatDisplayDate(template.start_date)}
                                </p>
                                {progress && (
                                  <p className="text-caption text-muted-foreground mt-0.5">
                                    {progress.loaded} de {progress.expected} pagos cargados este mes
                                  </p>
                                )}
                              </div>

                              <div className="flex items-center gap-3 shrink-0">
                                <span className="text-callout numeric vibrant font-medium">
                                  {template.amount != null
                                    ? `${formatCurrency(template.amount)}${frequencySuffix[template.frequency]}`
                                    : paydayPreviewText(template.start_date, template.frequency, todayArStr())}
                                </span>
                                {isInformationalPayday && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8 gap-1.5 text-caption"
                                    onClick={() => handleQuickLogPayment(template)}
                                  >
                                    <Plus className="h-3.5 w-3.5" />
                                    Cargar pago
                                  </Button>
                                )}
                                {isActive && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8 gap-1.5 text-caption"
                                    onClick={() => openUpdateDialog(template)}
                                  >
                                    <RefreshCcw className="h-3.5 w-3.5" />
                                    Actualizar
                                  </Button>
                                )}
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                  onClick={() => setDeletingRecurring(template)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </TabsContent>

          {/* ─── Insumos ─── */}
          <TabsContent value="insumos" className="mt-4">
            <div className="mb-4">
              <CostosSummaryRow />
            </div>
            <SuppliesTab />
          </TabsContent>

          {/* ─── Recetas ─── */}
          <TabsContent value="recetas" className="mt-4">
            <RecipesTab />
          </TabsContent>
        </Tabs>
      </div>

      {/* ─── Create one-off expense dialog ─── */}
      <Dialog
        open={expenseDialogOpen}
        onOpenChange={(open) => {
          setExpenseDialogOpen(open);
          if (!open) resetExpenseForm();
        }}
      >
        <DialogContent className="sm:max-w-xl ios-glass rounded-2xl">
          <DialogHeader>
            <DialogTitle>{editingExpense ? "Editar gasto" : "Nuevo gasto"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Monto</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={expenseAmount}
                  onChange={(e) => setExpenseAmount(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Categoría</Label>
                <Select
                  value={expenseCategory}
                  onValueChange={(v) => {
                    const next = v as ExpenseCategory;
                    setExpenseCategory(next);
                    if (next !== "supplies") {
                      setExpenseSupplyId(null);
                      setExpenseSupplyQuantity("");
                      setExpenseSupplyMode("native");
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="supplies">Insumos</SelectItem>
                    <SelectItem value="services">Servicios</SelectItem>
                    <SelectItem value="salaries">Sueldos</SelectItem>
                    <SelectItem value="rent">Alquiler</SelectItem>
                    <SelectItem value="other">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Fecha</Label>
              <Popover open={expenseCalendarOpen} onOpenChange={setExpenseCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start gap-2 font-normal">
                    <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                    {formatDisplayDate(expenseDate)}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={new Date(expenseDate + "T12:00:00")}
                    onSelect={(date) => {
                      if (date) setExpenseDate(date.toLocaleDateString("en-CA", { timeZone: TZ }));
                      setExpenseCalendarOpen(false);
                    }}
                    disabled={{ after: new Date() }}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-1.5">
              <Label>
                Descripción <span className="text-muted-foreground font-normal">(opcional)</span>
              </Label>
              <Textarea
                placeholder={categoryDescriptionPlaceholder[expenseCategory]}
                value={expenseDescription}
                onChange={(e) => setExpenseDescription(e.target.value)}
                rows={2}
              />
            </div>

            {expenseCategory === "supplies" && (
              <div className="space-y-2">
                <div className="space-y-1.5">
                  <Label>
                    Insumo <span className="text-muted-foreground font-normal">(opcional)</span>
                  </Label>
                  <Select
                    value={expenseSupplyId ?? "none"}
                    onValueChange={(v) => {
                      setExpenseSupplyId(v === "none" ? null : v);
                      setExpenseSupplyQuantity("");
                      setExpenseSupplyMode("native");
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Ninguno</SelectItem>
                      {activeSupplies.map((supply) => (
                        <SelectItem key={supply.id} value={supply.id}>
                          {supply.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!selectedExpenseSupply && (
                    <p className="text-caption text-muted-foreground">
                      Si vinculás un insumo, el gasto también suma su stock. El costo por unidad no
                      se toca acá — eso se edita desde Insumos.
                    </p>
                  )}
                </div>

                {selectedExpenseSupply && (
                  <div className="space-y-1.5 rounded-xl border p-3">
                    <Label className="text-caption">Cantidad comprada</Label>
                    <SupplyQuantityInput
                      supply={selectedExpenseSupply}
                      value={expenseSupplyQuantity}
                      mode={expenseSupplyMode}
                      onValueChange={setExpenseSupplyQuantity}
                      onModeChange={setExpenseSupplyMode}
                    />
                    {resolvedExpenseSupplyQuantity !== null ? (
                      <p className="text-caption text-muted-foreground">
                        Se suma al stock actual ({selectedExpenseSupply.stock_quantity}{" "}
                        {selectedExpenseSupply.unit})
                      </p>
                    ) : (
                      <p className="text-caption" style={{ color: "var(--status-canceled)" }}>
                        Completá la cantidad para sumarla al stock — si la dejás así, el gasto se
                        guarda sin tocar el stock.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setExpenseDialogOpen(false);
                resetExpenseForm();
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={editingExpense ? handleUpdateExpense : handleCreateExpense}
              disabled={
                !expenseAmount ||
                parseFloat(expenseAmount) <= 0 ||
                createExpense.isPending ||
                updateExpense.isPending
              }
            >
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete one-off expense confirm ─── */}
      <AlertDialog open={!!deletingExpense} onOpenChange={(open) => !open && setDeletingExpense(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar gasto</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Eliminar el gasto {deletingExpense ? `de ${formatCurrency(deletingExpense.amount)}` : ""}?
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive" onClick={handleDeleteExpense}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Create recurring template dialog ─── */}
      <Dialog
        open={recurringDialogOpen}
        onOpenChange={(open) => {
          setRecurringDialogOpen(open);
          if (!open) resetRecurringForm();
        }}
      >
        <DialogContent className="sm:max-w-xl ios-glass rounded-2xl">
          <DialogHeader>
            <DialogTitle>Nuevo gasto fijo</DialogTitle>
            <DialogDescription>
              Plantilla mensual — alquiler, sueldos, servicios recurrentes.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Descripción</Label>
                <Input
                  placeholder={categoryTemplateDescriptionPlaceholder[recurringCategory]}
                  value={recurringDescription}
                  onChange={(e) => setRecurringDescription(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Categoría</Label>
                <Select
                  value={recurringCategory}
                  onValueChange={(v) => {
                    const next = v as ExpenseCategory;
                    setRecurringCategory(next);
                    if (next !== "salaries") setRecurringFrequency("monthly");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="supplies">Insumos</SelectItem>
                    <SelectItem value="services">Servicios</SelectItem>
                    <SelectItem value="salaries">Sueldos</SelectItem>
                    <SelectItem value="rent">Alquiler</SelectItem>
                    <SelectItem value="other">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {recurringFrequency === "monthly" ? (
              <div className="space-y-1.5">
                <Label>Monto {frequencyLabels[recurringFrequency].toLowerCase()}</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={recurringAmount}
                  onChange={(e) => setRecurringAmount(e.target.value)}
                />
              </div>
            ) : (
              <p className="text-caption text-muted-foreground">
                El monto se carga cada {recurringPeriodNoun[recurringFrequency]} en &quot;Del
                período&quot;, ya que puede variar.
              </p>
            )}

            {recurringCategory === "salaries" && (
              <div className="space-y-1.5">
                <Label>Frecuencia</Label>
                <Select
                  value={recurringFrequency}
                  onValueChange={(v) => setRecurringFrequency(v as RecurringExpenseFrequency)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">{frequencyLabels.weekly}</SelectItem>
                    <SelectItem value="biweekly">{frequencyLabels.biweekly}</SelectItem>
                    <SelectItem value="monthly">{frequencyLabels.monthly}</SelectItem>
                  </SelectContent>
                </Select>
                {recurringPaydayPreview && (
                  <p className="text-caption text-muted-foreground">{recurringPaydayPreview}</p>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Vigente desde</Label>
              <Popover open={recurringCalendarOpen} onOpenChange={setRecurringCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start gap-2 font-normal">
                    <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                    {formatDisplayDate(recurringStartDate)}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={new Date(recurringStartDate + "T12:00:00")}
                    onSelect={(date) => {
                      if (date) setRecurringStartDate(date.toLocaleDateString("en-CA", { timeZone: TZ }));
                      setRecurringCalendarOpen(false);
                    }}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRecurringDialogOpen(false);
                resetRecurringForm();
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleCreateRecurring}
              disabled={
                (recurringFrequency === "monthly" &&
                  (!recurringAmount || parseFloat(recurringAmount) <= 0)) ||
                !recurringDescription.trim() ||
                createRecurring.isPending
              }
            >
              Crear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Update (close + replace) recurring template dialog ─── */}
      <Dialog
        open={updateDialogOpen}
        onOpenChange={(open) => {
          setUpdateDialogOpen(open);
          if (!open) setUpdatingTemplate(null);
        }}
      >
        <DialogContent className="sm:max-w-xl ios-glass rounded-2xl">
          <DialogHeader>
            <DialogTitle>Actualizar</DialogTitle>
            <DialogDescription>
              Esto NO edita el gasto actual: cierra &quot;{updatingTemplate?.description}&quot; el día
              anterior a la nueva fecha y crea un gasto fijo nuevo con el monto y la frecuencia
              actualizados. El histórico queda intacto.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {updateFrequency === "monthly" ? (
              <div className="space-y-1.5">
                <Label>Nuevo monto {frequencyLabels[updateFrequency].toLowerCase()}</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={updateAmount}
                  onChange={(e) => setUpdateAmount(e.target.value)}
                />
              </div>
            ) : (
              <p className="text-caption text-muted-foreground">
                El monto se carga cada {recurringPeriodNoun[updateFrequency]} en &quot;Del
                período&quot;, ya que puede variar.
              </p>
            )}

            {updatingTemplate?.category === "salaries" && (
              <div className="space-y-1.5">
                <Label>Frecuencia</Label>
                <Select
                  value={updateFrequency}
                  onValueChange={(v) => setUpdateFrequency(v as RecurringExpenseFrequency)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">{frequencyLabels.weekly}</SelectItem>
                    <SelectItem value="biweekly">{frequencyLabels.biweekly}</SelectItem>
                    <SelectItem value="monthly">{frequencyLabels.monthly}</SelectItem>
                  </SelectContent>
                </Select>
                {updatePaydayPreview && (
                  <p className="text-caption text-muted-foreground">{updatePaydayPreview}</p>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Vigente desde</Label>
              <Popover open={updateCalendarOpen} onOpenChange={setUpdateCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start gap-2 font-normal">
                    <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                    {formatDisplayDate(updateStartDate)}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={new Date(updateStartDate + "T12:00:00")}
                    onSelect={(date) => {
                      if (date) setUpdateStartDate(date.toLocaleDateString("en-CA", { timeZone: TZ }));
                      setUpdateCalendarOpen(false);
                    }}
                  />
                </PopoverContent>
              </Popover>
              {updatingTemplate && (
                <p className="text-caption text-muted-foreground">
                  El gasto anterior se cerrará el {formatDisplayDate(dayBeforeStr(updateStartDate))}.
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setUpdateDialogOpen(false);
                setUpdatingTemplate(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleUpdateRecurring}
              disabled={
                (updateFrequency === "monthly" &&
                  (!updateAmount || parseFloat(updateAmount) <= 0)) ||
                closeAndReplace.isPending
              }
            >
              Cerrar y crear nuevo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete recurring template confirm ─── */}
      <AlertDialog
        open={!!deletingRecurring}
        onOpenChange={(open) => !open && setDeletingRecurring(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar gasto fijo</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Eliminar &quot;{deletingRecurring?.description}&quot;? Usá esto solo para entradas
              cargadas por error, no para cambios de monto. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive" onClick={handleDeleteRecurring}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

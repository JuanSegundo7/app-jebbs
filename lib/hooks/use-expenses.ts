"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type {
  Expense,
  ExpenseCategory,
  RecurringExpense,
  RecurringExpenseFrequency,
} from "@/lib/types";

function expensesQueryKey(startDate: string, endDate: string) {
  return ["expenses", startDate, endDate];
}

// Thrown by useCreateExpense when the expense row itself was inserted
// successfully but the follow-up stock bump failed — this codebase has no
// transaction/RPC to roll the insert back, so the expense is already
// committed at that point. Distinguishing this from a plain create failure
// lets the caller avoid telling the user to retry (which would duplicate
// the expense) and instead point them at Insumos to fix stock by hand.
export class StockUpdateError extends Error {
  readonly expense: Expense;
  readonly cause: unknown;

  constructor(expense: Expense, cause: unknown) {
    super("El gasto se guardó pero no se pudo actualizar el stock");
    this.name = "StockUpdateError";
    this.expense = expense;
    this.cause = cause;
  }
}

export function isStockUpdateFailure(error: unknown): error is StockUpdateError {
  return error instanceof StockUpdateError;
}

// Thrown by useDeleteExpense when the expense row was deleted successfully
// but the stock-reversal UPDATE that follows it failed — the delete already
// committed (there is no undo), so this needs to be distinguishable from a
// generic delete failure the same way StockUpdateError is for creation.
export class StockRevertError extends Error {
  readonly expenseId: string;
  readonly cause: unknown;

  constructor(expenseId: string, cause: unknown) {
    super("El gasto se eliminó pero no se pudo actualizar el stock");
    this.name = "StockRevertError";
    this.expenseId = expenseId;
    this.cause = cause;
  }
}

export function isStockRevertFailure(error: unknown): error is StockRevertError {
  return error instanceof StockRevertError;
}

// Thrown by useUpdateExpense when the expense row itself saved successfully
// but a stock adjustment (reversing the old link and/or applying the new
// one) failed partway — the row update already committed, so this needs to
// be distinguishable from a generic update failure the same way
// StockUpdateError/StockRevertError are for create/delete.
export class StockAdjustError extends Error {
  readonly expenseId: string;
  readonly cause: unknown;

  constructor(expenseId: string, cause: unknown) {
    super("El gasto se guardó pero no se pudo ajustar el stock");
    this.name = "StockAdjustError";
    this.expenseId = expenseId;
    this.cause = cause;
  }
}

export function isStockAdjustFailure(error: unknown): error is StockAdjustError {
  return error instanceof StockAdjustError;
}

function recurringExpensesQueryKey() {
  return ["recurring-expenses"];
}

// ─── One-off expenses ───────────────────────────────────────────────────────

export function useExpenses(startDate: string, endDate: string) {
  const supabase = createClient();

  return useQuery({
    queryKey: expensesQueryKey(startDate, endDate),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date", { ascending: false });

      if (error) throw error;
      return data as Expense[];
    },
  });
}

export function useCreateExpense(startDate: string, endDate: string) {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      date: string;
      amount: number;
      category: ExpenseCategory;
      description: string | null;
      supply_id?: string | null;
      quantity?: number | null;
    }) => {
      const { data, error } = await supabase
        .from("expenses")
        .insert(input)
        .select()
        .single();

      if (error) throw error;
      const expense = data as Expense;

      // Optional stock bump: only when the user picked a specific supply and
      // a quantity for this expense. Mirrors the client-computed
      // "current + purchased" update the Insumos tab's restock popover uses
      // (components/costos/supplies-tab.tsx) — this codebase has no atomic
      // increment RPC, so the current value is read then written back.
      if (input.supply_id && input.quantity) {
        try {
          const { data: supply, error: supplyError } = await supabase
            .from("supplies")
            .select("stock_quantity")
            .eq("id", input.supply_id)
            .single();

          if (supplyError) throw supplyError;

          const { error: updateError } = await supabase
            .from("supplies")
            .update({ stock_quantity: Number(supply.stock_quantity) + input.quantity })
            .eq("id", input.supply_id);

          if (updateError) throw updateError;
        } catch (stockError) {
          // The expense row above is already committed — surface a distinct
          // error type instead of a generic one, so the caller doesn't tell
          // the user to retry (which would insert a duplicate expense).
          throw new StockUpdateError(expense, stockError);
        }
      }

      return expense;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: expensesQueryKey(startDate, endDate) });
      queryClient.invalidateQueries({ queryKey: ["orders-analytics"] });
      queryClient.invalidateQueries({ queryKey: ["supplies"] });
    },
    onError: (error) => {
      // Even though this mutation "failed", the expense insert underneath
      // it did not — refresh so the row shows up instead of looking lost.
      if (isStockUpdateFailure(error)) {
        queryClient.invalidateQueries({ queryKey: expensesQueryKey(startDate, endDate) });
        queryClient.invalidateQueries({ queryKey: ["orders-analytics"] });
      }
    },
  });
}

export function useDeleteExpense(startDate: string, endDate: string) {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      // Read supply_id/quantity BEFORE deleting: once the row is gone there
      // is no way to know whether this expense ever bumped stock, or by how
      // much, to reverse it.
      const { data: expense, error: fetchError } = await supabase
        .from("expenses")
        .select("supply_id, quantity")
        .eq("id", id)
        .single();

      if (fetchError) throw fetchError;

      const { error: deleteError } = await supabase
        .from("expenses")
        .delete()
        .eq("id", id);

      if (deleteError) throw deleteError;

      // Mirrors useCreateExpense's bump condition exactly, in reverse.
      if (expense.supply_id && expense.quantity) {
        // maybeSingle, not single: the supply may have been deleted
        // independently since this expense was created (ON DELETE SET NULL
        // on expenses.supply_id would normally have cleared this already,
        // but a race is still possible) — nothing to reverse against then,
        // and that's a clean exit, not an error.
        const { data: supply } = await supabase
          .from("supplies")
          .select("stock_quantity")
          .eq("id", expense.supply_id)
          .maybeSingle();

        if (supply) {
          // No floor at 0: negative stock is a legal value (a deliberate
          // manual correction), so clamping here could silently overwrite
          // one — e.g. stock corrected to -2 for an unrelated reason, then
          // this reversal subtracts 3 more; the correct result is -5, and a
          // clamp to 0 would destroy 5 units of information with no error.
          const reverted = Number(supply.stock_quantity) - Number(expense.quantity);
          const { error: revertError } = await supabase
            .from("supplies")
            .update({ stock_quantity: reverted })
            .eq("id", expense.supply_id);

          // The expense row above is already deleted — surface a distinct
          // error type instead of failing silently, so the caller doesn't
          // show "Gasto eliminado" while the stock reversal actually failed.
          if (revertError) throw new StockRevertError(id, revertError);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: expensesQueryKey(startDate, endDate) });
      queryClient.invalidateQueries({ queryKey: ["orders-analytics"] });
      queryClient.invalidateQueries({ queryKey: ["supplies"] });
    },
    onError: (error) => {
      // Even though this mutation "failed", the delete underneath it did
      // not — refresh so the row disappears instead of looking like it's
      // still there.
      if (isStockRevertFailure(error)) {
        queryClient.invalidateQueries({ queryKey: expensesQueryKey(startDate, endDate) });
        queryClient.invalidateQueries({ queryKey: ["orders-analytics"] });
      }
    },
  });
}

export function useUpdateExpense(startDate: string, endDate: string) {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      id: string;
      date: string;
      amount: number;
      category: ExpenseCategory;
      description: string | null;
      supply_id?: string | null;
      quantity?: number | null;
    }) => {
      // Read the OLD supply_id/quantity before overwriting the row — once
      // it's updated there is no way to know what stock effect to reverse.
      const { data: previous, error: fetchError } = await supabase
        .from("expenses")
        .select("supply_id, quantity")
        .eq("id", input.id)
        .single();

      if (fetchError) throw fetchError;

      const { data, error } = await supabase
        .from("expenses")
        .update({
          date: input.date,
          amount: input.amount,
          category: input.category,
          description: input.description,
          supply_id: input.supply_id ?? null,
          quantity: input.quantity ?? null,
        })
        .eq("id", input.id)
        .select()
        .single();

      if (error) throw error;
      const expense = data as Expense;

      // The row above is already committed — from here on, any stock
      // adjustment failure must be surfaced as a distinct error type so the
      // caller doesn't tell the user to retry (which would re-apply an
      // adjustment on top of one that may have partially succeeded).
      try {
        // Reverse the old link first, mirroring useDeleteExpense exactly.
        if (previous.supply_id && previous.quantity) {
          const { data: oldSupply, error: oldSupplyError } = await supabase
            .from("supplies")
            .select("stock_quantity")
            .eq("id", previous.supply_id)
            .maybeSingle();

          if (oldSupplyError) throw oldSupplyError;

          if (oldSupply) {
            // No floor at 0 — same reasoning as useDeleteExpense's reversal.
            const reverted = Number(oldSupply.stock_quantity) - Number(previous.quantity);
            const { error: revertError } = await supabase
              .from("supplies")
              .update({ stock_quantity: reverted })
              .eq("id", previous.supply_id);

            if (revertError) throw revertError;
          }
        }

        // Then apply the new link, mirroring useCreateExpense's bump.
        if (input.supply_id && input.quantity) {
          const { data: newSupply, error: newSupplyError } = await supabase
            .from("supplies")
            .select("stock_quantity")
            .eq("id", input.supply_id)
            .single();

          if (newSupplyError) throw newSupplyError;

          const { error: bumpError } = await supabase
            .from("supplies")
            .update({ stock_quantity: Number(newSupply.stock_quantity) + input.quantity })
            .eq("id", input.supply_id);

          if (bumpError) throw bumpError;
        }
      } catch (stockError) {
        throw new StockAdjustError(expense.id, stockError);
      }

      return expense;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: expensesQueryKey(startDate, endDate) });
      queryClient.invalidateQueries({ queryKey: ["orders-analytics"] });
      queryClient.invalidateQueries({ queryKey: ["supplies"] });
    },
    onError: (error) => {
      // Even though this mutation "failed", the row update underneath it
      // did not — refresh so the edited values show up instead of looking
      // like the edit was lost.
      if (isStockAdjustFailure(error)) {
        queryClient.invalidateQueries({ queryKey: expensesQueryKey(startDate, endDate) });
        queryClient.invalidateQueries({ queryKey: ["orders-analytics"] });
      }
    },
  });
}

// ─── Recurring expenses (fixed monthly templates) ──────────────────────────

export function useRecurringExpenses() {
  const supabase = createClient();

  return useQuery({
    queryKey: recurringExpensesQueryKey(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recurring_expenses")
        .select("*")
        .order("start_date", { ascending: false });

      if (error) throw error;
      return data as RecurringExpense[];
    },
  });
}

export function useCreateRecurringExpense() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      amount: number | null;
      category: ExpenseCategory;
      description: string;
      frequency: RecurringExpenseFrequency;
      start_date: string;
      end_date?: string | null;
    }) => {
      const { data, error } = await supabase
        .from("recurring_expenses")
        .insert(input)
        .select()
        .single();

      if (error) throw error;
      return data as RecurringExpense;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: recurringExpensesQueryKey() });
      queryClient.invalidateQueries({ queryKey: ["orders-analytics"] });
    },
  });
}

// Enforces "never mutate an active template's amount": closes the old
// template with an end_date and inserts a brand new row, instead of
// updating the existing row's amount in place.
export function useCloseAndReplaceRecurringExpense() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      closeId: string;
      closeEndDate: string;
      newExpense: {
        amount: number | null;
        category: ExpenseCategory;
        description: string;
        frequency: RecurringExpenseFrequency;
        start_date: string;
      };
    }) => {
      const { error: closeError } = await supabase
        .from("recurring_expenses")
        .update({ end_date: input.closeEndDate })
        .eq("id", input.closeId);

      if (closeError) throw closeError;

      const { data, error: insertError } = await supabase
        .from("recurring_expenses")
        .insert(input.newExpense)
        .select()
        .single();

      if (insertError) throw insertError;
      return data as RecurringExpense;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: recurringExpensesQueryKey() });
      queryClient.invalidateQueries({ queryKey: ["orders-analytics"] });
    },
  });
}

export function useDeleteRecurringExpense() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("recurring_expenses")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: recurringExpensesQueryKey() });
      queryClient.invalidateQueries({ queryKey: ["orders-analytics"] });
    },
  });
}

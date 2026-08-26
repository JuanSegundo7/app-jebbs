"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type {
  Burger,
  BurgerSupplyWithDetails,
  Extra,
  ExtraSupplyWithDetails,
  RecipeLineWithDetails,
  RecipeScaling,
  Supply,
  SupplyPurchaseMode,
} from "@/lib/types";

function suppliesQueryKey() {
  return ["supplies"];
}

function burgerRecipeQueryKey(burgerId: string) {
  return ["burger-recipe", burgerId];
}

function allBurgersWithRecipesQueryKey() {
  return ["burgers-with-recipes"];
}

function extraRecipeQueryKey(extraId: string) {
  return ["extra-recipe", extraId];
}

function allExtrasWithRecipesQueryKey() {
  return ["extras-with-recipes"];
}

// ─── Supplies catalog ───────────────────────────────────────────────────────

export function useSupplies() {
  const supabase = createClient();

  return useQuery({
    queryKey: suppliesQueryKey(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplies")
        .select("*")
        .order("name");

      if (error) throw error;
      return data as Supply[];
    },
  });
}

export function useCreateSupply() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      name: string;
      unit: string;
      cost_per_unit: number;
      stock_quantity?: number;
      is_active: boolean;
      unit_weight_grams?: number | null;
      purchase_mode?: SupplyPurchaseMode | null;
      purchase_price?: number | null;
      purchase_units?: number | null;
    }) => {
      const { data, error } = await supabase
        .from("supplies")
        .insert(input)
        .select()
        .single();

      if (error) throw error;
      return data as Supply;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: suppliesQueryKey() });
      queryClient.invalidateQueries({ queryKey: allBurgersWithRecipesQueryKey() });
      queryClient.invalidateQueries({ queryKey: allExtrasWithRecipesQueryKey() });
    },
  });
}

export function useUpdateSupply() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      id: string;
      name?: string;
      unit?: string;
      cost_per_unit?: number;
      stock_quantity?: number;
      is_active?: boolean;
      unit_weight_grams?: number | null;
      purchase_mode?: SupplyPurchaseMode | null;
      purchase_price?: number | null;
      purchase_units?: number | null;
    }) => {
      const { id, ...fields } = input;
      const { data, error } = await supabase
        .from("supplies")
        .update(fields)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as Supply;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: suppliesQueryKey() });
      queryClient.invalidateQueries({ queryKey: allBurgersWithRecipesQueryKey() });
      queryClient.invalidateQueries({ queryKey: allExtrasWithRecipesQueryKey() });
    },
  });
}

// Postgres raises 23503 (foreign_key_violation) when a supply is still
// referenced by a burger_supplies row (ON DELETE RESTRICT). The error is
// left to propagate — the calling component must catch it and show a clear
// message, not swallow it here.
export function useDeleteSupply() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("supplies")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: suppliesQueryKey() });
      queryClient.invalidateQueries({ queryKey: allBurgersWithRecipesQueryKey() });
      queryClient.invalidateQueries({ queryKey: allExtrasWithRecipesQueryKey() });
    },
  });
}

// ─── Recipes (burger_supplies) ──────────────────────────────────────────────

export function useBurgerRecipe(burgerId: string) {
  const supabase = createClient();

  return useQuery({
    queryKey: burgerRecipeQueryKey(burgerId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("burger_supplies")
        .select("*, supply:supplies(*)")
        .eq("burger_id", burgerId);

      if (error) throw error;
      return data as BurgerSupplyWithDetails[];
    },
    enabled: !!burgerId,
  });
}

export function useAllBurgersWithRecipes() {
  const supabase = createClient();

  return useQuery({
    queryKey: allBurgersWithRecipesQueryKey(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("burgers")
        .select("*, burger_supplies(*, supply:supplies(*))")
        .order("name");

      if (error) throw error;
      return data as (Burger & { burger_supplies: BurgerSupplyWithDetails[] })[];
    },
  });
}

// Upsert on the (burger_id, supply_id) unique constraint — natural fit for
// "add or update this recipe line" without juggling insert-vs-update in the
// component.
export function useSetBurgerRecipeLine() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      burger_id: string;
      supply_id: string;
      quantity: number;
      // Passed straight through into the upsert payload. Deliberately
      // required-ish (not defaulted/omitted here) — a single-object upsert
      // only writes columns present in the payload, so silently omitting
      // this field would leave an existing line's scales_with unchanged
      // when the caller actually meant "set it to null/fixed". The caller
      // is responsible for passing it explicitly, including `null`.
      scales_with?: RecipeScaling | null;
    }) => {
      const { data, error } = await supabase
        .from("burger_supplies")
        .upsert(input, { onConflict: "burger_id,supply_id" })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: burgerRecipeQueryKey(data.burger_id) });
      queryClient.invalidateQueries({ queryKey: allBurgersWithRecipesQueryKey() });
    },
  });
}

// Invalidates the "burger-recipe" key without a burgerId suffix: TanStack
// Query treats that as a prefix match by default (exact: false), so it
// invalidates every open useBurgerRecipe(burgerId) query at once without
// this mutation needing to know which burger the deleted row belonged to.
export function useDeleteBurgerRecipeLine() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("burger_supplies")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["burger-recipe"] });
      queryClient.invalidateQueries({ queryKey: allBurgersWithRecipesQueryKey() });
    },
  });
}

// ─── Recipes (extra_supplies) ───────────────────────────────────────────────
// Mirrors the burger-recipe hooks above exactly — same query/mutation/
// invalidation shape, targeting extra_supplies instead of burger_supplies.
// See scripts/013-extra-supplies.sql.

export function useExtraRecipe(extraId: string) {
  const supabase = createClient();

  return useQuery({
    queryKey: extraRecipeQueryKey(extraId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("extra_supplies")
        .select("*, supply:supplies(*)")
        .eq("extra_id", extraId);

      if (error) throw error;
      return data as ExtraSupplyWithDetails[];
    },
    enabled: !!extraId,
  });
}

export function useAllExtrasWithRecipes() {
  const supabase = createClient();

  return useQuery({
    queryKey: allExtrasWithRecipesQueryKey(),
    queryFn: async () => {
      // No .eq("is_available", true) filter — matches useAllBurgersWithRecipes,
      // which doesn't filter is_available either: an unavailable extra still
      // has a cost and still holds stock.
      const { data, error } = await supabase
        .from("extras")
        .select("*, extra_supplies(*, supply:supplies(*))")
        .order("category")
        .order("name");

      if (error) throw error;
      return data as (Extra & { extra_supplies: ExtraSupplyWithDetails[] })[];
    },
  });
}

// Upsert on the (extra_id, supply_id) unique constraint — same "add or
// update this recipe line" fit as useSetBurgerRecipeLine.
export function useSetExtraRecipeLine() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { extra_id: string; supply_id: string; quantity: number }) => {
      const { data, error } = await supabase
        .from("extra_supplies")
        .upsert(input, { onConflict: "extra_id,supply_id" })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: extraRecipeQueryKey(data.extra_id) });
      queryClient.invalidateQueries({ queryKey: allExtrasWithRecipesQueryKey() });
    },
  });
}

// Invalidates the "extra-recipe" key without an extraId suffix — same prefix-
// match trick useDeleteBurgerRecipeLine uses for ["burger-recipe"].
export function useDeleteExtraRecipeLine() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("extra_supplies")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["extra-recipe"] });
      queryClient.invalidateQueries({ queryKey: allExtrasWithRecipesQueryKey() });
    },
  });
}

// ─── Recipe editor facade ────────────────────────────────────────────────────

export type RecipeTargetRef = { kind: "burger"; id: string } | { kind: "extra"; id: string };

export interface RecipeEditor {
  recipe: RecipeLineWithDetails[] | undefined;
  isLoading: boolean;
  isSaving: boolean;
  saveLine: (input: {
    supply_id: string;
    quantity: number;
    scales_with?: RecipeScaling | null;
  }) => Promise<unknown>;
  deleteLine: (id: string) => Promise<void>;
}

// One recipe editor for either kind of product. Both underlying queries are
// instantiated unconditionally (rules of hooks) and the inactive one is
// disabled by passing "" as its id — useBurgerRecipe/useExtraRecipe already
// gate on `enabled: !!id`, so the inactive one never fires a request.
export function useRecipeEditor(target: RecipeTargetRef): RecipeEditor {
  const burgerRecipe = useBurgerRecipe(target.kind === "burger" ? target.id : "");
  const extraRecipe = useExtraRecipe(target.kind === "extra" ? target.id : "");
  const setBurgerLine = useSetBurgerRecipeLine();
  const setExtraLine = useSetExtraRecipeLine();
  const deleteBurgerLine = useDeleteBurgerRecipeLine();
  const deleteExtraLine = useDeleteExtraRecipeLine();

  if (target.kind === "burger") {
    return {
      recipe: burgerRecipe.data,
      isLoading: burgerRecipe.isLoading,
      isSaving: setBurgerLine.isPending,
      saveLine: (input) => setBurgerLine.mutateAsync({ burger_id: target.id, ...input }),
      deleteLine: (id) => deleteBurgerLine.mutateAsync(id),
    };
  }
  return {
    recipe: extraRecipe.data,
    isLoading: extraRecipe.isLoading,
    isSaving: setExtraLine.isPending,
    saveLine: (input) =>
      setExtraLine.mutateAsync({
        extra_id: target.id,
        supply_id: input.supply_id,
        quantity: input.quantity,
      }),
    deleteLine: (id) => deleteExtraLine.mutateAsync(id),
  };
}

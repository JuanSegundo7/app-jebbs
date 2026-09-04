"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useNextStep } from "nextstepjs";
import { useAllBurgersWithRecipes, useAllExtrasWithRecipes } from "@/lib/hooks/use-supplies";
import type { Burger, BurgerSupplyWithDetails, ExtraCategory, ExtraWithRecipes } from "@/lib/types";
import {
  calculateBurgerCost,
  calculateMargin,
  calculateMakeableCount,
  resolveRecipeQuantities,
  scalingContextFromBurger,
} from "@/lib/utils/costing";
import { MarginByBurgerChart } from "@/components/costos/margin-by-burger-chart";
import { EditRecipeDialog, type RecipeTarget } from "@/components/costos/edit-recipe-dialog";
import { RecipeTable, type RecipeTableRow } from "@/components/costos/recipe-table";

export type BurgerWithRecipes = Burger & { burger_supplies: BurgerSupplyWithDetails[] };

// Mirrors app/(dashboard)/extras/page.tsx's categoryLabels exactly — kept as
// a local copy instead of importing from the page module so this component
// doesn't depend on another route's file. Keep these two in sync if a
// category label ever changes.
const categoryLabels: Record<ExtraCategory, string> = {
  extra: "Extras",
  drink: "Bebidas",
  fries: "Papas",
  sides: "Acompañamientos",
};

// The "costos" tour's steps that walk through EditRecipeDialog (see
// components/onboarding/tours.tsx) — kept as a contiguous range so the
// effect below knows exactly when to auto-open/close the demo dialog.
// Update these if the tour's step order changes.
const MODAL_TOUR_STEP_START = 9;
const MODAL_TOUR_STEP_END = 12;

export function RecipesTab() {
  const { data: burgers, isLoading } = useAllBurgersWithRecipes();
  const { data: extras, isLoading: extrasLoading } = useAllExtrasWithRecipes();
  // Two independent search boxes (one per table), matching each table's own
  // Card the way the burger table already worked before this refactor — see
  // recipe-table.tsx's Task 1 notes for why a single shared box was passed
  // over: RecipeTable renders its own visible search input per Card, so
  // sharing one state would mean two mirrored inputs on screen instead of a
  // single control, which reads as more confusing than two independent ones.
  const [burgerSearch, setBurgerSearch] = useState("");
  const [extraSearch, setExtraSearch] = useState("");
  const [editingTarget, setEditingTarget] = useState<RecipeTarget | null>(null);

  const burgerById = useMemo(() => new Map((burgers ?? []).map((b) => [b.id, b])), [burgers]);
  const extraById = useMemo(() => new Map((extras ?? []).map((e) => [e.id, e])), [extras]);

  const burgerRows = useMemo<RecipeTableRow[]>(() => {
    if (!burgers) return [];
    return burgers.map((burger) => {
      const resolved = resolveRecipeQuantities(burger.burger_supplies, scalingContextFromBurger(burger));
      const hasRecipe = burger.burger_supplies.length > 0;
      const unitCost = calculateBurgerCost(resolved);
      const margin = calculateMargin(burger.base_price, unitCost);
      const makeable = calculateMakeableCount(resolved);
      const limitingSupplyName =
        resolved.find((l) => l.supply.id === makeable.limitingSupplyId)?.supply.name ?? null;
      return {
        id: burger.id,
        name: burger.name,
        salePrice: burger.base_price,
        hasRecipe,
        unitCost,
        margin,
        makeable,
        limitingSupplyName,
      };
    });
  }, [burgers]);

  const extraRows = useMemo<RecipeTableRow[]>(() => {
    if (!extras) return [];
    return extras.map((extra: ExtraWithRecipes) => {
      const hasRecipe = extra.extra_supplies.length > 0;
      // Extras never scale (no meat/fries-quantity analogue) — fed
      // unresolved, straight into the same costing helpers burgers use.
      const unitCost = calculateBurgerCost(extra.extra_supplies);
      const margin = calculateMargin(extra.price, unitCost);
      const makeable = calculateMakeableCount(extra.extra_supplies);
      const limitingSupplyName =
        extra.extra_supplies.find((l) => l.supply.id === makeable.limitingSupplyId)?.supply.name ?? null;
      return {
        id: extra.id,
        name: extra.name,
        badge: categoryLabels[extra.category],
        salePrice: extra.price,
        hasRecipe,
        unitCost,
        margin,
        makeable,
        limitingSupplyName,
      };
    });
  }, [extras]);

  // Drives the tour into EditRecipeDialog: the modal only exists once a row
  // is clicked, so the "costos" tour opens a demo burger (the first one with
  // a recipe, ignoring the user's own search filter) while it's walking
  // through the modal-step range, and closes it again once the tour moves
  // past that range. `tourOpenedRef` tracks whether *we* opened it, so a
  // dialog the user opened by hand (outside a tour) is never touched here.
  const { currentTour, currentStep } = useNextStep();
  const tourOpenedRef = useRef(false);
  useEffect(() => {
    const inModalRange =
      currentTour === "costos" && currentStep >= MODAL_TOUR_STEP_START && currentStep <= MODAL_TOUR_STEP_END;

    if (inModalRange) {
      const demoRow = burgerRows.find((row) => row.hasRecipe);
      const demoBurger = demoRow ? burgerById.get(demoRow.id) : undefined;
      if (demoBurger) {
        tourOpenedRef.current = true;
        setEditingTarget({ kind: "burger", burger: demoBurger });
      }
      return;
    }

    if (tourOpenedRef.current) {
      tourOpenedRef.current = false;
      setEditingTarget(null);
    }
  }, [currentTour, currentStep, burgerRows, burgerById]);

  // El buscador es estado local persistente; si quedó con texto que filtra
  // todo a cero, el paso del tour "#costos-makeable-header" no tiene nada
  // que resaltar. Se limpia al ARRANCAR el tour "costos" (no en cada paso,
  // para no pisarle al usuario algo que tipeó a mitad del recorrido).
  useEffect(() => {
    if (currentTour === "costos") setBurgerSearch("");
  }, [currentTour]);

  // Feeds the margin chart above the table — burgers without a recipe are
  // excluded, same as the KPI averages, since their 100%-margin reading is
  // an artifact of a $0 cost rather than a real number.
  const chartRows = useMemo(
    () =>
      burgerRows
        .filter((row) => row.hasRecipe)
        .map((row) => ({
          id: row.id,
          name: row.name,
          marginPct: row.margin.percentage,
          marginAmount: row.margin.amount,
          unitCost: row.unitCost,
          basePrice: row.salePrice,
        })),
    [burgerRows]
  );

  function handleBurgerRowClick(id: string) {
    const burger = burgerById.get(id);
    if (burger) setEditingTarget({ kind: "burger", burger });
  }

  function handleExtraRowClick(id: string) {
    const extra = extraById.get(id);
    if (extra) setEditingTarget({ kind: "extra", extra });
  }

  return (
    <>
      <p className="text-caption text-muted-foreground mb-3">
        Esto es la receta de costeo (insumo + cantidad + costo). Es distinto de los ingredientes que
        se ven en <span className="font-medium">/menu</span>, que son sólo etiquetas para sacar cosas
        en el wizard de pedidos y no tienen cantidades ni costo.
      </p>

      <div className="mb-4">
        <MarginByBurgerChart rows={chartRows} isLoading={isLoading} />
      </div>

      <RecipeTable
        cardId="costos-recipes-card"
        makeableHeaderId="costos-makeable-header"
        nameHeader="Hamburguesa"
        priceHeader="Precio base"
        searchPlaceholder="Buscar hamburguesa..."
        emptyLabel="No hay hamburguesas cargadas"
        search={burgerSearch}
        onSearchChange={setBurgerSearch}
        rows={burgerRows}
        isLoading={isLoading}
        onRowClick={handleBurgerRowClick}
      />

      <div className="mt-6 mb-3">
        <h3 className="text-subheadline font-medium">Extras, bebidas y acompañamientos</h3>
        <p className="text-caption text-muted-foreground mt-1">
          Misma idea que arriba pero para lo que no es hamburguesa: extras, bebidas, papas y
          acompañamientos también tienen su propia receta de costeo.
        </p>
      </div>

      <RecipeTable
        cardId="costos-extra-recipes-card"
        nameHeader="Ítem"
        priceHeader="Precio"
        searchPlaceholder="Buscar extra..."
        emptyLabel="No hay extras cargados"
        search={extraSearch}
        onSearchChange={setExtraSearch}
        rows={extraRows}
        isLoading={extrasLoading}
        onRowClick={handleExtraRowClick}
      />

      {editingTarget && (
        <EditRecipeDialog
          target={editingTarget}
          open={!!editingTarget}
          onOpenChange={(open) => !open && setEditingTarget(null)}
        />
      )}
    </>
  );
}

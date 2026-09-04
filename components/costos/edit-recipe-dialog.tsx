"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import { Plus, X } from "lucide-react";
import { useRecipeEditor, useSupplies } from "@/lib/hooks/use-supplies";
import type {
  BurgerSupplyWithDetails,
  ExtraWithRecipes,
  RecipeLineWithDetails,
  RecipeScaling,
} from "@/lib/types";
import type { BurgerWithRecipes } from "@/components/costos/recipes-tab";
import { formatCurrency } from "@/lib/utils/format";
import {
  calculateBurgerCost,
  calculateMargin,
  calculateSuggestedPrice,
  calculateLineMakeable,
  calculateMakeableCount,
  calculateCostBreakdown,
  resolveRecipeQuantities,
  scalingContextFromBurger,
  scalingFactor,
  MARGIN_TARGET_DEFAULT,
} from "@/lib/utils/costing";
import { IngredientSuggestions } from "@/components/costos/ingredient-suggestions";

export type RecipeTarget =
  | { kind: "burger"; burger: BurgerWithRecipes }
  | { kind: "extra"; extra: ExtraWithRecipes };

// Options shown for the "scales with" selects (add-line form + per-line
// select). "fixed" is the UI-only label for scales_with === null.
const SCALING_OPTIONS: { value: RecipeScaling | "fixed"; label: string }[] = [
  { value: "fixed", label: "Cantidad fija" },
  { value: "meat", label: "Por medallón" },
  { value: "fries", label: "Por porción de papas" },
];

export function EditRecipeDialog({
  target,
  open,
  onOpenChange,
}: {
  target: RecipeTarget;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  // Normalized product view so the rest of the JSX branches as little as
  // possible on target.kind. `scaling` is null for extras — they have no
  // meat/fries-quantity analogue to scale by (see scripts/014-burger-supply-
  // scaling.sql), so resolveRecipeQuantities/scalingFactor treat a null
  // context as "no scaling" for every line, uniformly.
  const product =
    target.kind === "burger"
      ? {
          id: target.burger.id,
          name: target.burger.name,
          salePrice: target.burger.base_price,
          ingredients: target.burger.ingredients as string[] | null,
          scaling: scalingContextFromBurger(target.burger),
          priceEditHref: "/precios",
        }
      : {
          id: target.extra.id,
          name: target.extra.name,
          salePrice: target.extra.price,
          ingredients: null as string[] | null,
          scaling: null,
          priceEditHref: "/extras",
        };

  const { recipe, isLoading, isSaving, saveLine, deleteLine } = useRecipeEditor({
    kind: target.kind,
    id: product.id,
  });
  const { data: supplies } = useSupplies();

  const [supplyId, setSupplyId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [addLineScalesWith, setAddLineScalesWith] = useState<RecipeScaling | "fixed">("fixed");
  // Click-to-edit: only one recipe line's quantity is editable at a time.
  // The draft only ever holds the value being typed — once it's committed
  // (blur/Enter) editingLineId goes back to null and the row reads straight
  // from `recipe` again, so a failed mutation "rolls back" for free: nothing
  // local was ever mutated, the displayed quantity was always the
  // last-committed server value.
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [quantityDrafts, setQuantityDrafts] = useState<Record<string, string>>({});
  // Set only while a scaling-flip conversion prefill is awaiting the user's
  // confirmation (see handleLineScalingChange) — keyed by line id so
  // commitQuantityDraft knows to save the NEW scales_with alongside whatever
  // quantity the user confirms, instead of the line's current one.
  const [pendingLineScaling, setPendingLineScaling] = useState<Record<string, RecipeScaling | null>>(
    {}
  );

  const rawLines: RecipeLineWithDetails[] =
    target.kind === "burger" ? target.burger.burger_supplies : target.extra.extra_supplies;

  // Lazy initializer seeded from the product's CURRENT actual margin, computed
  // from the already-joined burger/extra prop (not the separately-fetched
  // `recipe` query) so it's available synchronously at mount with no loading
  // flash. EditRecipeDialog is remounted per-target by RecipesTab, so this
  // reseeds correctly every time a different burger/extra is opened.
  const [targetMargin, setTargetMargin] = useState(() =>
    calculateMargin(
      product.salePrice,
      calculateBurgerCost(resolveRecipeQuantities(rawLines, product.scaling))
    ).percentage.toFixed(1)
  );

  const activeSupplies = useMemo(() => supplies?.filter((s) => s.is_active) ?? [], [supplies]);

  // Everything past this point that feeds cost/margin/makeable/breakdown
  // works on the RESOLVED (effective) quantities. `recipeBySupplyId` below
  // is the one deliberate exception — it backs the editable-quantity field,
  // which must always read/write the BASE (per-driver-unit) quantity.
  const resolvedRecipe = useMemo(
    () => (recipe ? resolveRecipeQuantities(recipe, product.scaling) : []),
    [recipe, product.scaling]
  );

  const totalCost = useMemo(() => calculateBurgerCost(resolvedRecipe), [resolvedRecipe]);
  const margin = useMemo(
    () => calculateMargin(product.salePrice, totalCost),
    [product.salePrice, totalCost]
  );
  const makeable = useMemo(() => calculateMakeableCount(resolvedRecipe), [resolvedRecipe]);
  const breakdown = useMemo(() => calculateCostBreakdown(resolvedRecipe), [resolvedRecipe]);
  const recipeBySupplyId = useMemo(() => {
    const map = new Map<string, RecipeLineWithDetails>();
    for (const line of recipe ?? []) map.set(line.supply_id, line);
    return map;
  }, [recipe]);
  const limitingSupplyName = recipe?.find((l) => l.supply.id === makeable.limitingSupplyId)?.supply.name;

  const marginColor =
    margin.percentage >= MARGIN_TARGET_DEFAULT ? "var(--status-paid)" : "var(--status-canceled)";

  async function handleAddLine() {
    if (!supplyId) {
      toast.error("Elegí un insumo antes de agregarlo");
      return;
    }
    const parsedQuantity = parseFloat(quantity.replace(",", "."));
    if (!quantity || isNaN(parsedQuantity) || parsedQuantity <= 0) {
      toast.error("Ingresá una cantidad válida");
      return;
    }

    try {
      await saveLine({
        supply_id: supplyId,
        quantity: parsedQuantity,
        scales_with:
          target.kind === "burger"
            ? addLineScalesWith === "fixed"
              ? null
              : addLineScalesWith
            : undefined,
      });
      toast.success("Línea de receta guardada");
      setSupplyId("");
      setQuantity("");
      setAddLineScalesWith("fixed");
    } catch {
      toast.error("Error al guardar la línea de receta");
    }
  }

  async function handleRemoveLine(id: string) {
    try {
      await deleteLine(id);
      toast.success("Línea de receta eliminada");
    } catch {
      toast.error("Error al eliminar la línea de receta");
    }
  }

  function commitQuantityDraft(line: RecipeLineWithDetails) {
    const raw = quantityDrafts[line.id];
    const hasPendingScaling = target.kind === "burger" && line.id in pendingLineScaling;
    const nextScaling = pendingLineScaling[line.id];
    setEditingLineId(null);
    if (hasPendingScaling) {
      setPendingLineScaling((p) => {
        const next = { ...p };
        delete next[line.id];
        return next;
      });
    }
    if (raw === undefined) return;
    const parsed = parseFloat(raw.replace(",", "."));
    if (isNaN(parsed) || parsed <= 0) return;
    // Unchanged quantity AND no pending scaling flip to apply — nothing to save.
    if (!hasPendingScaling && parsed === line.quantity) return;

    // A single-object upsert only writes columns present in the payload, so
    // scales_with is always passed explicitly for burger lines (never
    // omitted) — correctness must not depend on "nothing else changed it".
    saveLine({
      supply_id: line.supply_id,
      quantity: parsed,
      scales_with:
        target.kind === "burger" ? (hasPendingScaling ? nextScaling : line.scales_with ?? null) : undefined,
    }).catch(() => toast.error("Error al actualizar la cantidad"));
  }

  // Burger-only: changes which configuration knob a line scales with.
  // Both directions of a factor > 1 flip would silently reinterpret the
  // stored quantity under the new meaning instead of converting it, so both
  // are routed into edit mode with a suggested converted value instead of
  // saving immediately:
  //   fixed -> scaled: the stored TOTAL would be reread as a PER-DRIVER-UNIT
  //     amount, multiplying the effective cost by `factor`. Suggestion:
  //     quantity / factor (the per-unit amount that keeps the same total).
  //   scaled -> fixed: the stored PER-DRIVER-UNIT amount would be reread as
  //     the TOTAL, dividing the effective cost by `factor`. Suggestion:
  //     quantity * factor (the total that keeps the same effective amount).
  function handleLineScalingChange(line: RecipeLineWithDetails, next: RecipeScaling | "fixed") {
    const nextValue: RecipeScaling | null = next === "fixed" ? null : next;

    if (!line.scales_with && nextValue) {
      const factor = scalingFactor(nextValue, product.scaling);
      if (factor > 1) {
        setPendingLineScaling((p) => ({ ...p, [line.id]: nextValue }));
        setEditingLineId(line.id);
        setQuantityDrafts((d) => ({ ...d, [line.id]: (line.quantity / factor).toFixed(3) }));
        return;
      }
    }

    if (line.scales_with && !nextValue) {
      const currentFactor = scalingFactor(line.scales_with, product.scaling);
      if (currentFactor > 1) {
        setPendingLineScaling((p) => ({ ...p, [line.id]: nextValue }));
        setEditingLineId(line.id);
        setQuantityDrafts((d) => ({ ...d, [line.id]: (line.quantity * currentFactor).toFixed(3) }));
        return;
      }
    }

    saveLine({
      supply_id: line.supply_id,
      quantity: line.quantity,
      scales_with: nextValue,
    }).catch(() => toast.error("Error al actualizar el insumo"));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl md:max-w-4xl lg:max-w-5xl max-h-[90vh] overflow-y-auto ios-glass rounded-2xl">
        <DialogHeader>
          <DialogTitle>Receta de {product.name}</DialogTitle>
          <DialogDescription>
            {target.kind === "burger"
              ? "Insumos y cantidades usados para producir esta hamburguesa."
              : "Insumos y cantidades usados para producir este ítem."}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[85vh] overflow-y-auto py-2">
          {/* ─── Veredicto: costo, margen, alcanza para ─── */}
          <div
            id="costos-recipe-dialog-verdict"
            className="mb-4 grid grid-cols-3 gap-3 rounded-xl border bg-muted/20 p-3"
          >
            <div className="border-r pr-3">
              <p className="text-caption text-muted-foreground">Costo unitario</p>
              <p className="text-title3 font-bold tabular-nums">{formatCurrency(totalCost)}</p>
            </div>
            <div className="border-r pr-3">
              <p className="text-caption text-muted-foreground">Margen</p>
              <p className="text-title3 font-bold tabular-nums" style={{ color: marginColor }}>
                {formatCurrency(margin.amount)}{" "}
                <span className="text-caption font-medium">({margin.percentage.toFixed(1)}%)</span>
              </p>
            </div>
            <div>
              <p className="text-caption text-muted-foreground">Alcanza para</p>
              {makeable.count === null ? (
                <p className="text-title3 font-bold text-muted-foreground">—</p>
              ) : (
                <>
                  <p
                    className="text-title3 font-bold tabular-nums"
                    style={makeable.count === 0 ? { color: "var(--status-canceled)" } : undefined}
                  >
                    {makeable.count} u.
                  </p>
                  {makeable.limitingSupplyId && (
                    <p className="text-caption text-muted-foreground truncate">
                      limita: {limitingSupplyName ?? "—"}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>

          {/* ─── Receta (izquierda) + sugerencias/precio (derecha) ─── */}
          {/* md (768px), not lg (1024px): a real laptop browser window
              routinely sits below 1024px CSS width — non-maximized, devtools
              open, OS display scaling — so gating the two-column layout on
              lg left it single-column on exactly the screens it was meant
              for. md is comfortably within reach of any laptop. */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[3fr_2fr]">
            <div className="min-w-0 space-y-3">
              <p className="text-caption font-medium text-muted-foreground">
                Ingredientes de la receta
              </p>

              {/* ─── Ingredientes de la receta, ordenados por costo ─── */}
              {isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-14" />
                  <Skeleton className="h-14" />
                </div>
              ) : !recipe || recipe.length === 0 ? (
                <p className="text-subheadline text-muted-foreground text-center py-4">
                  {target.kind === "burger"
                    ? "Esta hamburguesa no tiene receta cargada"
                    : "Este ítem no tiene receta cargada"}
                </p>
              ) : (
                <div id="costos-recipe-dialog-breakdown" className="space-y-2">
                  {breakdown.map((row) => {
                    const line = recipeBySupplyId.get(row.supplyId);
                    if (!line) return null;
                    const isEditing = editingLineId === line.id;
                    const lineMakeable = calculateLineMakeable(
                      row.quantity,
                      line.supply.stock_quantity
                    );
                    const isLimiting = line.supply.id === makeable.limitingSupplyId;
                    const resolvedLine = resolvedRecipe.find((l) => l.id === line.id);

                    return (
                      <div key={line.id} className="rounded-xl bg-muted/40 px-3 py-2 space-y-1.5">
                        <div className="flex items-center gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <p className="text-subheadline font-medium truncate">{row.name}</p>
                              {line.supply.is_active === false && (
                                <Badge variant="outline" className="text-caption">
                                  Inactivo
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-1 text-caption text-muted-foreground">
                              {isEditing ? (
                                <Input
                                  autoFocus
                                  type="number"
                                  min="0"
                                  step="0.001"
                                  className="h-6 w-20 text-caption tabular-nums"
                                  value={quantityDrafts[line.id] ?? String(line.quantity)}
                                  onChange={(e) =>
                                    setQuantityDrafts((d) => ({ ...d, [line.id]: e.target.value }))
                                  }
                                  onBlur={() => commitQuantityDraft(line)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") e.currentTarget.blur();
                                  }}
                                />
                              ) : (
                                <button
                                  type="button"
                                  className="underline decoration-dotted underline-offset-2 hover:text-foreground"
                                  onClick={() => {
                                    setEditingLineId(line.id);
                                    setQuantityDrafts((d) => ({
                                      ...d,
                                      [line.id]: String(line.quantity),
                                    }));
                                  }}
                                >
                                  {line.quantity}
                                </button>
                              )}
                              <span>
                                {line.supply.unit} · stock {line.supply.stock_quantity}{" "}
                                {line.supply.unit}
                              </span>
                            </div>
                          </div>
                          <span className="text-subheadline font-semibold tabular-nums">
                            {formatCurrency(row.lineCost)}
                          </span>
                          <span
                            className="w-16 shrink-0 text-right text-caption tabular-nums"
                            style={isLimiting ? { color: "var(--status-canceled)" } : undefined}
                          >
                            {lineMakeable ?? "—"} u.
                          </span>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => handleRemoveLine(line.id)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>

                        {/* Escala (burger-only) — la cantidad editable arriba
                            siempre es la cantidad BASE (por medallón/porción,
                            o fija); este renglón muestra la cantidad EFECTIVA
                            resultante para que ese número no quede oculto. */}
                        {target.kind === "burger" && (
                          <div className="flex items-center gap-2">
                            <Select
                              value={line.scales_with ?? "fixed"}
                              onValueChange={(v) =>
                                handleLineScalingChange(line, v as RecipeScaling | "fixed")
                              }
                            >
                              <SelectTrigger className="h-6 w-auto gap-1 border-none bg-transparent px-1 text-caption2 text-muted-foreground shadow-none hover:bg-muted">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {SCALING_OPTIONS.map((opt) => (
                                  <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {line.scales_with && resolvedLine && (
                              <span className="text-caption2 text-muted-foreground">
                                = {resolvedLine.quantity} {line.supply.unit} (×
                                {resolvedLine.scalingFactor}{" "}
                                {line.scales_with === "meat" ? "medallones" : "porciones"})
                              </span>
                            )}
                          </div>
                        )}

                        {/* Participación en el costo total de la receta */}
                        <div className="flex items-center gap-2">
                          <div className="h-1 flex-1 rounded-full bg-muted">
                            <div
                              className="h-1 rounded-full"
                              style={{
                                width: `${row.share * 100}%`,
                                backgroundColor: "var(--color-chart-2)",
                              }}
                            />
                          </div>
                          <span className="w-10 shrink-0 text-right text-caption text-muted-foreground tabular-nums">
                            {(row.share * 100).toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ─── Agregar insumo manualmente ─── */}
              <div className="flex items-end gap-2 border-t pt-3">
                <div className="flex-1 space-y-1.5">
                  <Label className="text-caption">Insumo</Label>
                  <Select value={supplyId} onValueChange={setSupplyId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Elegir insumo" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeSupplies.map((supply) => (
                        <SelectItem key={supply.id} value={supply.id}>
                          {supply.name} ({supply.unit})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-24 space-y-1.5">
                  <Label className="text-caption">
                    {target.kind === "burger"
                      ? addLineScalesWith === "meat"
                        ? "Cant. por medallón"
                        : addLineScalesWith === "fries"
                          ? "Cant. por porción"
                          : "Cantidad"
                      : "Cantidad"}
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.001"
                    placeholder="0"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                  />
                </div>
                {target.kind === "burger" && (
                  <div className="w-36 space-y-1.5">
                    <Label className="text-caption">Escala</Label>
                    <Select
                      value={addLineScalesWith}
                      onValueChange={(v) => setAddLineScalesWith(v as RecipeScaling | "fixed")}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SCALING_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <Button size="sm" className="h-9" onClick={handleAddLine} disabled={isSaving}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {/* ─── Sugerencias + precio sugerido (derecha) ─── */}
            <div className="min-w-0 space-y-4">
              {/* ─── Sugerencias desde /menu — sólo hamburguesas: los
                  extras no tienen ingredientes de /menu que enlazar ─── */}
              {target.kind === "burger" ? (
                <div
                  id="costos-recipe-dialog-suggestions"
                  className="space-y-2 rounded-xl bg-muted/30 p-3"
                >
                  <p className="text-caption font-medium text-muted-foreground">
                    Sugerencias desde el menú
                  </p>
                  <IngredientSuggestions
                    burgerId={target.burger.id}
                    ingredients={target.burger.ingredients}
                    supplies={supplies ?? []}
                    recipe={(recipe as BurgerSupplyWithDetails[] | undefined) ?? []}
                  />
                </div>
              ) : (
                <div className="hidden md:block" />
              )}

              {/* Read-only calculator — must NEVER write burgers.base_price
                  or extras.price. Those fields are edited only in /precios,
                  /menu and /extras; this section must not become a second
                  write path for either. No save/apply button, no mutation,
                  no burger/extra-update hook import here. */}
              <div
                id="costos-recipe-dialog-suggested-price"
                className="space-y-2 rounded-xl border p-3"
              >
                <p className="text-caption font-medium text-muted-foreground">Precio sugerido</p>
                <div className="space-y-1">
                  <Label className="text-caption">Margen objetivo (%)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="99.9"
                    step="0.1"
                    className="w-24"
                    value={targetMargin}
                    onChange={(e) => setTargetMargin(e.target.value)}
                  />
                </div>
                {(() => {
                  const parsedTarget = parseFloat(targetMargin.replace(",", "."));
                  if (totalCost <= 0) {
                    return (
                      <p className="text-subheadline text-muted-foreground">
                        Cargá la receta para calcular un precio sugerido.
                      </p>
                    );
                  }
                  if (isNaN(parsedTarget) || parsedTarget >= 100) {
                    return (
                      <p className="text-subheadline text-muted-foreground">
                        El margen objetivo tiene que ser menor a 100%.
                      </p>
                    );
                  }
                  const suggested = calculateSuggestedPrice(totalCost, parsedTarget);
                  if (suggested === null) return null;
                  const delta = product.salePrice - suggested;
                  return (
                    <div>
                      <p className="text-callout font-bold tabular-nums">
                        {formatCurrency(suggested)}
                      </p>
                      <p className="text-caption text-muted-foreground">
                        Precio actual {formatCurrency(product.salePrice)} · margen actual{" "}
                        {margin.percentage.toFixed(1)}%
                      </p>
                      <p
                        className="text-caption font-medium"
                        style={{
                          color: delta >= 0 ? "var(--status-paid)" : "var(--status-canceled)",
                        }}
                      >
                        {delta >= 0
                          ? `Estás ${formatCurrency(delta)} por encima del precio sugerido`
                          : `Estás ${formatCurrency(Math.abs(delta))} por debajo del precio sugerido`}
                      </p>
                    </div>
                  );
                })()}
                <p className="text-caption text-muted-foreground">Sólo es una sugerencia.</p>
                <Link href={product.priceEditHref} className="block text-caption text-primary hover:underline">
                  Editar el precio en {product.priceEditHref} →
                </Link>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="sm:justify-between items-center">
          <p className="text-caption text-muted-foreground">Los cambios se guardan automáticamente</p>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";
import type { BurgerSupplyWithDetails, Supply } from "@/lib/types";
import { buildIngredientSuggestions, type IngredientSuggestion } from "@/lib/utils/costing";
import { useSetBurgerRecipeLine, useCreateSupply } from "@/lib/hooks/use-supplies";
import { UnitCombobox } from "@/components/costos/unit-combobox";

interface IngredientSuggestionsProps {
  burgerId: string;
  ingredients: string[];
  supplies: Supply[];
  recipe: BurgerSupplyWithDetails[];
}

interface DraftRow {
  checked: boolean;
  supplyId: string;
  quantity: string;
  creatingSupply: boolean;
  newUnit: string;
  newCost: string;
  // The just-created supply, if any — kept locally so the picker can render
  // it as a selectable option immediately, without waiting for the
  // `useSupplies()` query above to refetch and pass a fresh `supplies` prop
  // down (that round trip can lag a beat, and a <Select> whose `value`
  // points at an option that isn't in its children yet renders blank).
  createdSupply: Supply | null;
}

function emptyDraft(supplyId: string, checked: boolean): DraftRow {
  return {
    checked,
    supplyId,
    quantity: "",
    creatingSupply: false,
    newUnit: "",
    newCost: "",
    createdSupply: null,
  };
}

// "Desde el menú": lists ingredients typed in /menu that don't have a recipe
// line yet, with a best-effort supply match (see buildIngredientSuggestions)
// the user confirms explicitly. Never writes a line on its own — no quantity
// is ever invented, and nothing here runs until "Agregar los N tildados" is
// clicked. Renders nothing once every menu ingredient already has a line.
export function IngredientSuggestions({
  burgerId,
  ingredients,
  supplies,
  recipe,
}: IngredientSuggestionsProps) {
  const suggestions = buildIngredientSuggestions(ingredients, supplies, recipe);
  const setRecipeLine = useSetBurgerRecipeLine();
  const createSupply = useCreateSupply();

  // Keyed by the ORIGINAL ingredient string. Backfilled (never overwritten)
  // whenever a new suggestion shows up, and pruned once its ingredient drops
  // out of `suggestions` — either because it was just confirmed into the
  // recipe (its supply_id now shows up in `recipe`, see
  // buildIngredientSuggestions) or removed from /menu — so a stale draft
  // can never resurrect after its row disappears.
  const [drafts, setDrafts] = useState<Record<string, DraftRow>>({});
  const suggestionKey = suggestions.map((s) => s.ingredient).join("|");

  useEffect(() => {
    setDrafts((prev) => {
      const next: Record<string, DraftRow> = {};
      for (const s of suggestions) {
        next[s.ingredient] =
          prev[s.ingredient] ??
          emptyDraft(
            s.supply?.id ?? "",
            s.matchKind === "exact" || s.matchKind === "approximate"
          );
      }
      return next;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    });
  }, [suggestionKey]);

  if (suggestions.length === 0) return null;

  function updateDraft(ingredient: string, patch: Partial<DraftRow>) {
    setDrafts((d) => ({ ...d, [ingredient]: { ...d[ingredient], ...patch } }));
  }

  async function handleCreateSupply(ingredient: string) {
    const draft = drafts[ingredient];
    const cost = parseFloat(draft.newCost.replace(",", "."));
    if (!draft.newUnit.trim() || isNaN(cost) || cost < 0) return;

    try {
      const created = await createSupply.mutateAsync({
        name: ingredient,
        unit: draft.newUnit.trim(),
        cost_per_unit: cost,
        stock_quantity: 0,
        is_active: true,
      });
      updateDraft(ingredient, {
        supplyId: created.id,
        createdSupply: created,
        creatingSupply: false,
        checked: true,
      });
      toast.success("Insumo creado");
    } catch {
      toast.error("Error al crear el insumo");
    }
  }

  // Only rows that are checked, have a supply picked, AND carry a valid
  // (> 0) quantity are ever included — this is the one gate that guarantees
  // no invented-quantity line ever reaches the database.
  const readyToAdd = suggestions.filter((s) => {
    const draft = drafts[s.ingredient];
    if (!draft?.checked || !draft.supplyId) return false;
    const qty = parseFloat(draft.quantity.replace(",", "."));
    return !isNaN(qty) && qty > 0;
  });

  async function handleAddChecked() {
    if (readyToAdd.length === 0) return;
    try {
      await Promise.all(
        readyToAdd.map((s) => {
          const draft = drafts[s.ingredient];
          const qty = parseFloat(draft.quantity.replace(",", "."));
          return setRecipeLine.mutateAsync({
            burger_id: burgerId,
            supply_id: draft.supplyId,
            quantity: qty,
          });
        })
      );
      toast.success(
        readyToAdd.length === 1
          ? "Línea de receta agregada"
          : `${readyToAdd.length} líneas de receta agregadas`
      );
    } catch {
      toast.error("Error al agregar las líneas de receta");
    }
  }

  const activeSupplies = supplies.filter((s) => s.is_active !== false);
  const existingUnits = Array.from(new Set(supplies.map((s) => s.unit).filter(Boolean)));

  function optionsFor(s: IngredientSuggestion, draft: DraftRow): Supply[] {
    // Ambiguous rows stay scoped to just the few name-matched candidates —
    // the point is to help disambiguate quickly, not to reopen the full
    // catalog. Every other case offers the full active catalog, same as the
    // manual "add recipe line" picker below this panel.
    const base = s.matchKind === "ambiguous" && !draft.createdSupply ? s.candidates : activeSupplies;
    if (draft.createdSupply && !base.some((sup) => sup.id === draft.createdSupply!.id)) {
      return [draft.createdSupply, ...base];
    }
    return base;
  }

  return (
    <div className="space-y-3 rounded-xl border p-3">
      <p className="text-caption font-medium text-muted-foreground">Desde el menú</p>
      <div className="space-y-2">
        {suggestions.map((s) => {
          const draft = drafts[s.ingredient];
          if (!draft) return null;

          return (
            <div
              key={s.ingredient}
              className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2"
            >
              <Checkbox
                checked={draft.checked}
                disabled={!draft.supplyId}
                onCheckedChange={(checked) =>
                  updateDraft(s.ingredient, { checked: checked === true })
                }
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-subheadline font-medium truncate">{s.ingredient}</span>
                  {s.matchKind === "approximate" && (
                    <Badge variant="outline" className="text-caption2 px-1.5 py-0 h-4">
                      aproximado
                    </Badge>
                  )}
                  {s.matchKind === "ambiguous" && !draft.supplyId && (
                    <Badge variant="outline" className="text-caption2 px-1.5 py-0 h-4">
                      elegí uno
                    </Badge>
                  )}
                </div>

                {!draft.supplyId ? (
                  draft.creatingSupply ? (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <UnitCombobox
                        value={draft.newUnit}
                        onChange={(unit) => updateDraft(s.ingredient, { newUnit: unit })}
                        existingUnits={existingUnits}
                        placeholder="Unidad"
                        className="h-7 w-28 text-caption"
                      />
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Costo/unidad"
                        className="h-7 w-24 text-caption"
                        value={draft.newCost}
                        onChange={(e) => updateDraft(s.ingredient, { newCost: e.target.value })}
                      />
                      <Button
                        size="sm"
                        className="h-7 text-caption"
                        onClick={() => handleCreateSupply(s.ingredient)}
                        disabled={createSupply.isPending}
                      >
                        Crear
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-1 h-6 gap-1 text-caption2"
                      onClick={() => updateDraft(s.ingredient, { creatingSupply: true })}
                    >
                      <Plus className="h-3 w-3" />
                      Crear insumo
                    </Button>
                  )
                ) : (
                  <Select
                    value={draft.supplyId}
                    onValueChange={(v) => updateDraft(s.ingredient, { supplyId: v })}
                  >
                    <SelectTrigger className="mt-1 h-7 w-full text-caption">
                      <SelectValue placeholder="Elegir insumo" />
                    </SelectTrigger>
                    <SelectContent>
                      {optionsFor(s, draft).map((sup) => (
                        <SelectItem key={sup.id} value={sup.id}>
                          {sup.name} ({sup.unit})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {draft.supplyId && (
                <Input
                  type="number"
                  min="0"
                  step="0.001"
                  placeholder="Cant."
                  className="h-8 w-20 shrink-0 text-right text-caption tabular-nums"
                  value={draft.quantity}
                  onChange={(e) => updateDraft(s.ingredient, { quantity: e.target.value })}
                />
              )}
            </div>
          );
        })}
      </div>

      <Button
        size="sm"
        className="h-8 w-full text-caption"
        onClick={handleAddChecked}
        disabled={readyToAdd.length === 0 || setRecipeLine.isPending}
      >
        Agregar los {readyToAdd.length} tildados
      </Button>
    </div>
  );
}

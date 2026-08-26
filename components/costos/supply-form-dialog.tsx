"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { UnitCombobox } from "@/components/costos/unit-combobox";
import {
  SupplyQuantityInput,
  resolveSupplyQuantity,
  type SupplyQuantityMode,
  type SupplyQuantityShape,
} from "@/components/costos/supply-quantity-input";
import { useCreateSupply, useUpdateSupply } from "@/lib/hooks/use-supplies";
import type { Supply, SupplyPurchaseMode } from "@/lib/types";
import { formatCurrency } from "@/lib/utils/format";
import {
  calculateCostPerUnitFromPackage,
  calculateCostPerUnitFromWeight,
} from "@/lib/utils/costing";

type FormErrors = { name?: string; unit?: string; cost?: string };

interface SupplyFormState {
  name: string;
  unit: string;
  purchaseMode: SupplyPurchaseMode;
  costPerUnit: string; // mode "unit"
  packagePrice: string; // mode "package"
  packageUnits: string; // mode "package"
  pricePerKilo: string; // mode "weight"
  // Mode "weight" is the only UI that edits this, but it's carried through
  // unchanged in every other mode — see the critical guard in handleSubmit.
  unitWeightGrams: string;
  stockQuantity: string;
  isActive: boolean;
}

const emptyForm: SupplyFormState = {
  name: "",
  unit: "",
  purchaseMode: "unit",
  costPerUnit: "",
  packagePrice: "",
  packageUnits: "",
  pricePerKilo: "",
  unitWeightGrams: "",
  stockQuantity: "0",
  isActive: true,
};

function parseDecimal(raw: string): number {
  return parseFloat(raw.trim().replace(",", "."));
}

// The live "cómo lo comprás" result: what cost_per_unit would be if the
// dialog submitted right now, given the active mode's inputs. Mirrors — and
// is the only caller of — the two pure converters in costing.ts; "unit"
// mode has no conversion, the typed value IS the result.
function resolveCostPerUnit(form: SupplyFormState): number | null {
  if (form.purchaseMode === "unit") {
    const parsed = parseDecimal(form.costPerUnit);
    return !form.costPerUnit.trim() || isNaN(parsed) || parsed < 0 ? null : parsed;
  }
  if (form.purchaseMode === "package") {
    return calculateCostPerUnitFromPackage(
      parseDecimal(form.packagePrice),
      parseDecimal(form.packageUnits)
    );
  }
  return calculateCostPerUnitFromWeight(
    parseDecimal(form.pricePerKilo),
    parseDecimal(form.unitWeightGrams)
  );
}

// Hoisted out of handleSubmit so the live stock-quantity toggle (which needs
// unit_weight_grams/purchase_units to know which conversions to offer) uses
// the exact same derivation as the payload that gets persisted — not a
// re-parsed copy that could drift from it.
//
// CRITICAL: unit_weight_grams must never be nulled out just because the
// active mode isn't "weight". A legacy supply may already have this set
// independently (from the old, removed kilos-conversion box), and the
// RestockPopover's kilos mode depends on it surviving every edit that
// doesn't deliberately touch it. Only "weight" mode's own field writes to
// `form.unitWeightGrams` — every other mode just carries whatever value is
// already sitting in form state straight through.
function derivePurchaseFields(form: SupplyFormState): {
  unitWeightGrams: number | null;
  purchasePrice: number | null;
  purchaseUnits: number | null;
} {
  const parsedUnitWeight = parseDecimal(form.unitWeightGrams);
  const unitWeightGrams =
    !form.unitWeightGrams.trim() || isNaN(parsedUnitWeight) || parsedUnitWeight <= 0
      ? null
      : parsedUnitWeight;

  const parsedPackagePrice = parseDecimal(form.packagePrice);
  const parsedPricePerKilo = parseDecimal(form.pricePerKilo);
  const parsedPackageUnits = parseDecimal(form.packageUnits);
  const purchasePrice =
    form.purchaseMode === "package"
      ? Number.isFinite(parsedPackagePrice)
        ? parsedPackagePrice
        : null
      : form.purchaseMode === "weight"
        ? Number.isFinite(parsedPricePerKilo)
          ? parsedPricePerKilo
          : null
        : null;
  const purchaseUnits =
    form.purchaseMode === "package" && Number.isFinite(parsedPackageUnits)
      ? parsedPackageUnits
      : null;

  return { unitWeightGrams, purchasePrice, purchaseUnits };
}

// The subset of a Supply that SupplyQuantityInput needs to decide which
// conversions (kilos/package) to offer for the "Stock actual" field — built
// live from the form's own draft state, since there's no persisted Supply
// yet on create (and on edit, the user may be changing purchase mode in the
// same session, so it must track the form, not the original editingSupply).
function deriveStockQuantityShape(form: SupplyFormState): SupplyQuantityShape {
  const { unitWeightGrams, purchaseUnits } = derivePurchaseFields(form);
  return {
    unit: form.unit.trim() || "unidad",
    unit_weight_grams: unitWeightGrams,
    purchase_mode: form.purchaseMode,
    purchase_units: purchaseUnits,
  };
}

// Create/edit dialog for a single supply. Reframes the old "type a derived
// cost_per_unit" form as "tell us how you buy it" — unit / package / weight
// — and computes cost_per_unit live from whichever mode is active, instead
// of asking the user to do that division by hand. See
// scripts/009-supply-purchase-basis.sql for why purchase_mode/price/units
// exist: so re-editing a supply reopens the same purchase inputs, not just
// the derived result.
export function SupplyFormDialog({
  open,
  onOpenChange,
  editingSupply,
  existingUnits,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingSupply: Supply | null;
  existingUnits: string[];
  onSaved?: (supplyId: string) => void;
}) {
  const createSupply = useCreateSupply();
  const updateSupply = useUpdateSupply();

  const [form, setForm] = useState<SupplyFormState>(emptyForm);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [stockQuantityMode, setStockQuantityMode] = useState<SupplyQuantityMode>("native");

  // Re-hydrate whenever the dialog opens (for a create OR a specific
  // supply), rather than on every `editingSupply` identity change — the
  // parent tab keeps `editingSupply` set while the dialog is closing, so
  // gating on `open` avoids a needless reset mid-close-animation.
  useEffect(() => {
    if (!open) return;
    if (editingSupply) {
      const mode: SupplyPurchaseMode = editingSupply.purchase_mode ?? "unit";
      setForm({
        name: editingSupply.name,
        unit: editingSupply.unit,
        purchaseMode: mode,
        costPerUnit: editingSupply.cost_per_unit.toString(),
        packagePrice: mode === "package" ? editingSupply.purchase_price?.toString() ?? "" : "",
        packageUnits: mode === "package" ? editingSupply.purchase_units?.toString() ?? "" : "",
        pricePerKilo: mode === "weight" ? editingSupply.purchase_price?.toString() ?? "" : "",
        unitWeightGrams: editingSupply.unit_weight_grams?.toString() ?? "",
        stockQuantity: editingSupply.stock_quantity.toString(),
        isActive: editingSupply.is_active,
      });
    } else {
      setForm(emptyForm);
    }
    setFormErrors({});
    // Always starts native, on both create and edit — the stock-quantity
    // toggle isn't persisted data, it's a one-shot UI convenience like
    // RestockPopover's, so there's no "previous mode" to restore.
    setStockQuantityMode("native");
  }, [open, editingSupply]);

  // The purchase mode can change live while this dialog is open (unlike
  // RestockPopover/the expense dialog, where the underlying supply is fixed
  // for the whole interaction) — if the stock toggle were left on
  // "package"/"kilos" after switching away from that mode, it would point at
  // data that just stopped being available. Reset it back to native instead.
  useEffect(() => {
    setStockQuantityMode("native");
  }, [form.purchaseMode]);

  const unitLabel = form.unit.trim() || "unidad";
  const resolvedCost = resolveCostPerUnit(form);
  const stockQuantityShape = deriveStockQuantityShape(form);
  const isPending = createSupply.isPending || updateSupply.isPending;

  function setMode(mode: SupplyPurchaseMode) {
    // Deliberately does NOT clear unitWeightGrams when leaving "weight" —
    // it must survive a mode switch so it's never silently dropped on
    // submit just because the user is browsing the other two modes.
    setForm((f) => ({ ...f, purchaseMode: mode }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const errors: FormErrors = {};
    if (!form.name.trim()) errors.name = "El nombre es obligatorio";
    if (!form.unit.trim()) errors.unit = "La unidad es obligatoria";

    const costPerUnit = resolveCostPerUnit(form);
    if (costPerUnit === null) {
      errors.cost =
        form.purchaseMode === "unit"
          ? "Ingresá un costo válido"
          : form.purchaseMode === "package"
            ? "Completá el precio y las unidades del paquete"
            : `Completá el precio del kilo y el peso por ${unitLabel}`;
    }
    setFormErrors(errors);
    if (Object.keys(errors).length > 0 || costPerUnit === null) return;

    // Optional, unlike cost: an empty/invalid/unresolvable stock value must
    // not block submission — treat it as 0 rather than as a validation
    // error, same criterion this field already had before it gained
    // kilos/package modes. allowNegative only applies in native mode: this
    // field is an ABSOLUTE "cuánto tenés ahora" value (a stocktake can land
    // on a negative correction), while kilos/package are purchase-only
    // conversions that must stay positive regardless of this toggle.
    const resolvedStock = resolveSupplyQuantity(
      deriveStockQuantityShape(form),
      form.stockQuantity,
      stockQuantityMode,
      { allowNegative: stockQuantityMode === "native" }
    );
    const stockQuantity = resolvedStock ?? 0;

    const { unitWeightGrams, purchasePrice, purchaseUnits } = derivePurchaseFields(form);

    const payload = {
      name: form.name.trim(),
      unit: form.unit.trim(),
      cost_per_unit: Number(costPerUnit.toFixed(2)),
      stock_quantity: stockQuantity,
      is_active: form.isActive,
      unit_weight_grams: unitWeightGrams,
      purchase_mode: form.purchaseMode,
      purchase_price: purchasePrice,
      purchase_units: purchaseUnits,
    };

    try {
      if (editingSupply) {
        await updateSupply.mutateAsync({ id: editingSupply.id, ...payload });
        toast.success("Insumo actualizado");
        onSaved?.(editingSupply.id);
      } else {
        const created = await createSupply.mutateAsync(payload);
        toast.success("Insumo creado");
        onSaved?.(created.id);
      }
      onOpenChange(false);
    } catch {
      toast.error(editingSupply ? "Error al actualizar el insumo" : "Error al crear el insumo");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl ios-glass rounded-2xl">
        <DialogHeader>
          <DialogTitle>{editingSupply ? "Editar insumo" : "Nuevo insumo"}</DialogTitle>
          <DialogDescription>
            {editingSupply ? "Modificá los datos del insumo" : "Completá los datos del nuevo insumo"}
          </DialogDescription>
        </DialogHeader>

        {/* `contents`: the form itself generates no box, so its two
            children (body + footer) slot directly into DialogContent's
            grid — same gap-6 rhythm as before — while Enter-to-submit and
            native form semantics still work normally. */}
        <form onSubmit={handleSubmit} className="contents">
          <div className="space-y-5 py-2">
            {/* ─── 1. Qué es ─── */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="supply-name">Nombre</Label>
                <Input
                  id="supply-name"
                  placeholder="ej: Medallón 180g"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
                {formErrors.name && <p className="text-xs text-destructive">{formErrors.name}</p>}
              </div>

              <div className="space-y-1.5">
                <Label>¿En qué lo contás en la receta?</Label>
                <UnitCombobox
                  value={form.unit}
                  onChange={(unit) => setForm((f) => ({ ...f, unit }))}
                  existingUnits={existingUnits}
                />
                {formErrors.unit ? (
                  <p className="text-xs text-destructive">{formErrors.unit}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Es la medida que vas a usar al armar recetas y al contar stock.
                  </p>
                )}
              </div>
            </div>

            {/* ─── 2. Cómo lo comprás ─── */}
            <div className="space-y-2.5 rounded-xl border p-3">
              <p className="text-xs font-medium text-muted-foreground">Cómo lo comprás</p>

              <ToggleGroup
                type="single"
                variant="outline"
                value={form.purchaseMode}
                onValueChange={(value) => value && setMode(value as SupplyPurchaseMode)}
                className="w-full"
              >
                <ToggleGroupItem value="unit" className="text-xs">
                  Por unidad
                </ToggleGroupItem>
                <ToggleGroupItem value="package" className="text-xs">
                  Por paquete
                </ToggleGroupItem>
                <ToggleGroupItem value="weight" className="text-xs">
                  Por peso
                </ToggleGroupItem>
              </ToggleGroup>

              {form.purchaseMode === "unit" && (
                <div className="space-y-1">
                  <Label className="text-xs">Costo por {unitLabel}</Label>
                  <InputGroup>
                    <InputGroupAddon>
                      <InputGroupText>$</InputGroupText>
                    </InputGroupAddon>
                    <InputGroupInput
                      type="text"
                      inputMode="decimal"
                      placeholder="0,00"
                      value={form.costPerUnit}
                      onChange={(e) => setForm((f) => ({ ...f, costPerUnit: e.target.value }))}
                    />
                  </InputGroup>
                </div>
              )}

              {form.purchaseMode === "package" && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Precio del paquete</Label>
                    <InputGroup>
                      <InputGroupAddon>
                        <InputGroupText>$</InputGroupText>
                      </InputGroupAddon>
                      <InputGroupInput
                        type="text"
                        inputMode="decimal"
                        placeholder="0,00"
                        value={form.packagePrice}
                        onChange={(e) => setForm((f) => ({ ...f, packagePrice: e.target.value }))}
                      />
                    </InputGroup>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">¿Cuántos {unitLabel} trae?</Label>
                    <InputGroup>
                      <InputGroupInput
                        type="text"
                        inputMode="decimal"
                        placeholder="0"
                        value={form.packageUnits}
                        onChange={(e) => setForm((f) => ({ ...f, packageUnits: e.target.value }))}
                      />
                    </InputGroup>
                  </div>
                </div>
              )}

              {form.purchaseMode === "weight" && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Precio del kilo</Label>
                    <InputGroup>
                      <InputGroupAddon>
                        <InputGroupText>$</InputGroupText>
                      </InputGroupAddon>
                      <InputGroupInput
                        type="text"
                        inputMode="decimal"
                        placeholder="0,00"
                        value={form.pricePerKilo}
                        onChange={(e) => setForm((f) => ({ ...f, pricePerKilo: e.target.value }))}
                      />
                    </InputGroup>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">¿Cuánto pesa un {unitLabel}?</Label>
                    <InputGroup>
                      <InputGroupInput
                        type="text"
                        inputMode="decimal"
                        placeholder="ej: 180"
                        value={form.unitWeightGrams}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, unitWeightGrams: e.target.value }))
                        }
                      />
                      <InputGroupAddon align="inline-end">
                        <InputGroupText>g</InputGroupText>
                      </InputGroupAddon>
                    </InputGroup>
                  </div>
                </div>
              )}

              {/* Tarjeta de resultado en vivo */}
              <div className="rounded-lg bg-muted/40 px-3 py-2">
                {resolvedCost !== null ? (
                  <>
                    <p className="text-sm font-semibold tabular-nums">
                      Costo por {unitLabel}: {formatCurrency(resolvedCost)}
                    </p>
                    {form.purchaseMode === "package" && (
                      <p className="text-xs text-muted-foreground">
                        ${form.packagePrice} / {form.packageUnits} {unitLabel}
                      </p>
                    )}
                    {form.purchaseMode === "weight" && (
                      <p className="text-xs text-muted-foreground">
                        ${form.pricePerKilo}/kg × {form.unitWeightGrams}g
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Completá los datos para ver el costo por {unitLabel}.
                  </p>
                )}
              </div>

              {formErrors.cost && <p className="text-xs text-destructive">{formErrors.cost}</p>}
            </div>

            {/* ─── 3. Stock y estado ─── */}
            <div className="grid grid-cols-2 gap-4 items-start">
              <div className="space-y-1">
                <Label className="text-xs">¿Cuántos {unitLabel} tenés ahora?</Label>
                <SupplyQuantityInput
                  supply={stockQuantityShape}
                  value={form.stockQuantity}
                  mode={stockQuantityMode}
                  onValueChange={(v) => setForm((f) => ({ ...f, stockQuantity: v }))}
                  onModeChange={setStockQuantityMode}
                  allowNegative
                />
                <p className="text-xs text-muted-foreground">
                  Podés dejarlo en 0 y cargarlo después con el botón de sumar stock. Si te quedó en
                  negativo, dejalo en negativo — es una corrección, no un error.
                </p>
              </div>

              <div className="flex items-start gap-2 pt-6">
                <Switch
                  id="supply-active"
                  checked={form.isActive}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
                />
                <div className="space-y-0.5">
                  <Label htmlFor="supply-active">Activo</Label>
                  <p className="text-xs text-muted-foreground">
                    Los insumos inactivos no aparecen al armar recetas nuevas.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {editingSupply ? "Guardar cambios" : "Crear insumo"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

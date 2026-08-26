"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Supply } from "@/lib/types";
import { calculateUnitsFromKilos, calculateUnitsFromPackages } from "@/lib/utils/costing";

export type SupplyQuantityMode = "native" | "kilos" | "package";

// The 4 fields this module actually reads off a Supply — widened from the
// full `Supply` type so callers that don't have a persisted Supply yet (the
// create/edit form, building this shape live from its own draft state) can
// still use resolveSupplyQuantity/SupplyQuantityInput. A full `Supply`
// satisfies this structurally, so RestockPopover and the expense dialog keep
// passing one unchanged.
export type SupplyQuantityShape = Pick<
  Supply,
  "unit" | "unit_weight_grams" | "purchase_mode" | "purchase_units"
>;

// Single source of truth for "what quantity, in the supply's native unit,
// does this raw input + mode represent" — shared by every place that lets a
// user log a purchase (RestockPopover, the "Nuevo gasto" dialog). Mirrors
// calculateUnitsFromKilos's null-on-invalid contract in native mode too, so
// callers can use one `=== null` check for both parsing errors and
// disabled-state guards.
export function resolveSupplyQuantity(
  supply: SupplyQuantityShape,
  raw: string,
  mode: SupplyQuantityMode,
  options?: { allowNegative?: boolean }
): number | null {
  const parsed = parseFloat(raw.replace(",", "."));
  if (mode === "kilos") {
    if (!supply.unit_weight_grams || supply.unit_weight_grams <= 0) return null;
    return calculateUnitsFromKilos(parsed, supply.unit_weight_grams);
  }
  if (mode === "package") {
    if (!supply.purchase_units || supply.purchase_units <= 0) return null;
    return calculateUnitsFromPackages(parsed, supply.purchase_units);
  }
  if (isNaN(parsed)) return null;
  // allowNegative is for the two ABSOLUTE "cuánto tenés ahora" fields, where
  // the input is a value, not a purchase: a stocktake can legitimately land
  // on a negative number (you sold more than the books say you had) and on
  // exactly 0. Purchases (RestockPopover, the "Nuevo gasto" dialog) stay
  // positive-only — "compré -5 unidades" is not a thing — and the kilos and
  // package branches above are purchase-only conversions by construction, so
  // this flag deliberately does not reach them. A user who needs a negative
  // correction switches the toggle to native mode.
  if (options?.allowNegative) return parsed;
  return parsed <= 0 ? null : parsed;
}

// Extracted from RestockPopover (components/costos/supplies-tab.tsx) so the
// kilos→units conversion looks and behaves identically everywhere it's
// offered, instead of drifting between copies. Controlled: the caller owns
// `value`/`mode` and decides what "confirm" means (restock vs. log an
// expense) — this component only renders the toggle, the input, and the
// conversion preview.
export function SupplyQuantityInput({
  supply,
  value,
  mode,
  onValueChange,
  onModeChange,
  inputClassName,
  autoFocus,
  onEnter,
  allowNegative,
}: {
  supply: SupplyQuantityShape;
  value: string;
  mode: SupplyQuantityMode;
  onValueChange: (value: string) => void;
  onModeChange: (mode: SupplyQuantityMode) => void;
  inputClassName?: string;
  autoFocus?: boolean;
  onEnter?: () => void;
  allowNegative?: boolean;
}) {
  const canConvertKilos = !!supply.unit_weight_grams && supply.unit_weight_grams > 0;
  // Gated on purchase_mode too, not just purchase_units being present: that
  // field can survive a switch away from "package" mode (same reason
  // unit_weight_grams survives switching away from "weight" in
  // supply-form-dialog.tsx), and a supply no longer bought by the package
  // shouldn't offer to log a purchase in packages.
  const canConvertPackage =
    supply.purchase_mode === "package" && !!supply.purchase_units && supply.purchase_units > 0;
  const convertedUnits =
    mode === "kilos" || mode === "package"
      ? resolveSupplyQuantity(supply, value, mode, { allowNegative })
      : null;

  function setMode(next: SupplyQuantityMode) {
    onValueChange("");
    onModeChange(next);
  }

  return (
    <div>
      {(canConvertKilos || canConvertPackage) && (
        <div className="mb-2 flex items-center gap-1 rounded-lg border bg-card p-0.5 w-fit">
          <Button
            type="button"
            variant={mode === "native" ? "default" : "ghost"}
            size="sm"
            className="h-6 rounded-md px-2 text-xs"
            onClick={() => setMode("native")}
          >
            En {supply.unit}
          </Button>
          {canConvertKilos && (
            <Button
              type="button"
              variant={mode === "kilos" ? "default" : "ghost"}
              size="sm"
              className="h-6 rounded-md px-2 text-xs"
              onClick={() => setMode("kilos")}
            >
              En kilos
            </Button>
          )}
          {canConvertPackage && (
            <Button
              type="button"
              variant={mode === "package" ? "default" : "ghost"}
              size="sm"
              className="h-6 rounded-md px-2 text-xs"
              onClick={() => setMode("package")}
            >
              En paquetes
            </Button>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Input
          autoFocus={autoFocus}
          type="number"
          min={allowNegative ? undefined : "0"}
          step="0.001"
          placeholder="0"
          className={inputClassName}
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onEnter?.();
          }}
        />
        <span className="shrink-0 text-xs text-muted-foreground">
          {mode === "kilos" ? "kg" : mode === "package" ? "paquetes" : supply.unit}
        </span>
      </div>

      {mode === "kilos" && (
        <p className="mt-1.5 text-xs">
          {convertedUnits === null ? (
            <span className="text-muted-foreground">
              = ? {supply.unit} · cada uno pesa {supply.unit_weight_grams}g
            </span>
          ) : convertedUnits === 0 ? (
            <span style={{ color: "var(--status-canceled)" }}>
              No alcanza para ni un {supply.unit} entero
            </span>
          ) : (
            <span className="font-medium">
              = {convertedUnits} {supply.unit}
            </span>
          )}
        </p>
      )}

      {mode === "package" && (
        <p className="mt-1.5 text-xs">
          {convertedUnits === null ? (
            <span className="text-muted-foreground">
              = ? {supply.unit} · cada paquete trae {supply.purchase_units} {supply.unit}
            </span>
          ) : (
            <span className="font-medium">
              = {convertedUnits} {supply.unit}
            </span>
          )}
        </p>
      )}
    </div>
  );
}

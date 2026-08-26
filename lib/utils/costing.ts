// Pure costing/margin math — no Supabase, no React. Cash-basis expenses
// (lib/utils/expenses.ts) and this file are deliberately separate: recipe
// cost is a per-product tool, it does not feed net revenue.

import type { BurgerCost, BurgerSupplyWithDetails, RecipeScaling, Supply } from "@/lib/types";

// Default target margin used across /costos (KPI row, recipe table coloring,
// the edit-recipe dialog's strip and margin chart) when no per-burger target
// has been set by the user. A single named constant instead of a `20`
// scattered across components.
export const MARGIN_TARGET_DEFAULT = 20;

export function calculateBurgerCost(
  recipe: { quantity: number; supply: { cost_per_unit: number } }[]
): number {
  return recipe.reduce((sum, line) => sum + line.quantity * Number(line.supply.cost_per_unit), 0);
}

// ─── Configuration scaling (doble vs simple) ───────────────────────────────
//
// See scripts/014-burger-supply-scaling.sql for the storage semantics. In
// short: a line with scales_with set stores the amount PER PATTY / PER
// FRIES PORTION, and the effective amount at the burger's default
// configuration is that number times the matching burgers.default_* field.
//
// Everything below this point in the file stays configuration-blind on
// purpose: callers resolve effective quantities once, up front, with
// resolveRecipeQuantities(), and then hand plain {quantity, supply} lines to
// calculateBurgerCost / calculateMakeableCount / calculateCostBreakdown
// exactly as before.

export interface RecipeScalingContext {
  meatQuantity: number;
  friesQuantity: number;
}

// The defensive primitive behind scalingContextFromBurger: turns two
// possibly-garbage numbers into a usable RecipeScalingContext, falling back
// to `fallback` (not silently to 1) when a value is missing/non-finite/
// negative. Exposed separately so callers with a DIFFERENT source of
// meat/fries counts — e.g. an order line's ACTUAL sold configuration,
// which can differ from a burger's table-wide default (see
// lib/utils/stock-consumption.ts) — get the same defensive behavior without
// having to shape their data to look like a Burger.
export function makeScalingContext(
  meat: unknown,
  fries: unknown,
  fallback: RecipeScalingContext = { meatQuantity: 1, friesQuantity: 1 }
): RecipeScalingContext {
  const meatNum = Number(meat);
  const friesNum = Number(fries);
  return {
    meatQuantity: Number.isFinite(meatNum) && meatNum >= 0 ? meatNum : fallback.meatQuantity,
    friesQuantity: Number.isFinite(friesNum) && friesNum >= 0 ? friesNum : fallback.friesQuantity,
  };
}

// Reads the two configuration knobs off a burger, defensively — both
// columns were added directly in Supabase and are typed non-null in
// lib/types, but a null/garbage value must degrade to "don't scale" (factor
// 1) rather than to NaN, which would poison cost/margin/makeable in one
// shot. A genuine 0 IS honoured — a burger configured with zero patties
// really does consume zero of a per-patty line. Thin wrapper around
// makeScalingContext; identical behavior to before that function was
// extracted.
export function scalingContextFromBurger(burger: {
  default_meat_quantity?: number | null;
  default_fries_quantity?: number | null;
}): RecipeScalingContext {
  return makeScalingContext(burger.default_meat_quantity, burger.default_fries_quantity);
}

// The multiplier a single line's stored quantity gets. A null context (an
// extra — extras never scale) or a null scalesWith both mean "no scaling".
export function scalingFactor(
  scalesWith: RecipeScaling | null | undefined,
  context: RecipeScalingContext | null
): number {
  if (!scalesWith || !context) return 1;
  return scalesWith === "meat" ? context.meatQuantity : context.friesQuantity;
}

// Replaces each line's `quantity` with its EFFECTIVE quantity at the given
// configuration, preserving the stored per-driver-unit number as
// `baseQuantity` and the multiplier as `scalingFactor` so the recipe editor
// can show "0.18 × 2 = 0.36" without recomputing. Returns a new array;
// never mutates its input.
export function resolveRecipeQuantities<
  T extends { quantity: number; scales_with?: RecipeScaling | null },
>(
  lines: T[],
  context: RecipeScalingContext | null
): (T & { baseQuantity: number; scalingFactor: number })[] {
  return lines.map((line) => {
    const factor = scalingFactor(line.scales_with, context);
    return {
      ...line,
      baseQuantity: Number(line.quantity),
      scalingFactor: factor,
      quantity: Number(line.quantity) * factor,
    };
  });
}

export interface Margin {
  amount: number;
  percentage: number;
}

export function calculateMargin(basePrice: number, unitCost: number): Margin {
  const amount = basePrice - unitCost;
  const percentage = basePrice > 0 ? (amount / basePrice) * 100 : 0;
  return { amount, percentage };
}

// Exact algebraic inverse of calculateMargin's
// `percentage = ((basePrice - unitCost) / basePrice) * 100`, solved for
// basePrice. No rounding here — formatCurrency handles display rounding,
// and rounding here would break the calculateMargin(calculateSuggestedPrice(...))
// round-trip invariant.
export function calculateSuggestedPrice(
  unitCost: number,
  targetMarginPct: number,
): number | null {
  if (!Number.isFinite(unitCost) || !Number.isFinite(targetMarginPct)) return null;
  // Zero (or negative) cost means every price gives a 100% margin — no
  // unique price satisfies a target, so there's no single answer.
  if (unitCost <= 0) return null;
  // Denominator hits zero or goes negative at/above 100% target margin.
  if (targetMarginPct >= 100) return null;
  return unitCost / (1 - targetMarginPct / 100);
}

// How many units of a single recipe line the current stock supports.
export function calculateLineMakeable(quantity: number, stockQuantity: number): number | null {
  const q = Number(quantity);
  const s = Number(stockQuantity);
  // A zero/invalid-consumption line can't bound production — it's excluded
  // from the min, not counted as 0.
  if (!Number.isFinite(q) || q <= 0) return null;
  // Non-finite stock (e.g. undefined, pre-migration) defaults to 0 — the
  // safe direction of error for a number that exists to warn before running out.
  const stock = Number.isFinite(s) ? s : 0;
  // DECIMAL columns arrive as JS floats: 0.3 / 0.1 === 2.9999999999999996,
  // so an unguarded Math.floor would under-report by 1. The 1e-9 epsilon
  // absorbs normal float error (~1e-11) without promoting a real 2.9998 to 3.
  return Math.max(0, Math.floor(stock / q + 1e-9));
}

export interface MakeableCount {
  count: number | null;
  limitingSupplyId: string | null;
}

// Per-burger, in isolation ("if I only made this one") — not a joint
// multi-recipe allocation across the whole menu competing for shared supplies.
// Lines referencing an is_active: false supply still count: is_active only
// gates whether a supply appears in the "add new recipe line" dropdown, it
// says nothing about whether the physical on-hand stock disappeared.
// Excluding those lines would make the reported count too high, which is
// the dangerous direction of error for a warning number.
export function calculateMakeableCount(
  recipe: { quantity: number; supply: { id: string; stock_quantity: number } }[],
): MakeableCount {
  let count: number | null = null;
  let limitingSupplyId: string | null = null;

  for (const line of recipe) {
    const lineMakeable = calculateLineMakeable(line.quantity, line.supply.stock_quantity);
    if (lineMakeable === null) continue;
    if (count === null || lineMakeable < count) {
      count = lineMakeable;
      limitingSupplyId = line.supply.id;
    }
  }

  return { count, limitingSupplyId };
}

// Converts a bulk purchase (kilos of raw product) into how many discrete
// portions of a supply that yields, using the supply's own
// `unit_weight_grams` conversion (e.g. "each medallón weighs 180g"). Powers
// the Insumos tab's "Sumar stock" popover for supplies that are tracked in a
// portion unit but purchased by weight. Mirrors calculateLineMakeable's
// epsilon-guarded floor: a portion is physical and discrete, so a partial
// one never counts — under-reporting is the safe direction of error here too.
export function calculateUnitsFromKilos(
  kilosPurchased: number,
  unitWeightGrams: number
): number | null {
  if (!Number.isFinite(kilosPurchased) || kilosPurchased <= 0) return null;
  if (!Number.isFinite(unitWeightGrams) || unitWeightGrams <= 0) return null;
  return Math.floor((kilosPurchased * 1000) / unitWeightGrams + 1e-9);
}

// Two more purchase-basis conversions, same shape as calculateUnitsFromKilos
// above: `null` on any non-finite or non-positive input, no rounding (that's
// a display decision, made where the result gets formatted/persisted). Power
// the Insumos create/edit modal's "cómo lo comprás" live cost preview — see
// scripts/009-supply-purchase-basis.sql.

// Buying by the package: cost_per_unit = what the whole package cost, split
// across how many units it contained.
export function calculateCostPerUnitFromPackage(
  packagePrice: number,
  packageUnits: number
): number | null {
  if (!Number.isFinite(packagePrice) || packagePrice <= 0) return null;
  if (!Number.isFinite(packageUnits) || packageUnits <= 0) return null;
  return packagePrice / packageUnits;
}

// Buying by weight: cost_per_unit = price per kilo, scaled down to however
// many grams one tracked unit actually weighs (unit_weight_grams).
export function calculateCostPerUnitFromWeight(
  pricePerKilo: number,
  unitWeightGrams: number
): number | null {
  if (!Number.isFinite(pricePerKilo) || pricePerKilo <= 0) return null;
  if (!Number.isFinite(unitWeightGrams) || unitWeightGrams <= 0) return null;
  return pricePerKilo * (unitWeightGrams / 1000);
}

// Same shape as calculateUnitsFromKilos, for a supply bought by the package
// (purchase_mode "package"): how many native units a purchase of N packages
// represents, using the supply's own purchase_units ("cada paquete trae X").
// Unlike the kilos conversion this is an exact multiplication, not a floor —
// a package's unit count is itself a whole quantity, so there's no partial
// remainder to round away.
export function calculateUnitsFromPackages(
  packagesPurchased: number,
  unitsPerPackage: number
): number | null {
  if (!Number.isFinite(packagesPurchased) || packagesPurchased <= 0) return null;
  if (!Number.isFinite(unitsPerPackage) || unitsPerPackage <= 0) return null;
  return packagesPurchased * unitsPerPackage;
}

// ─── Ingredient → supply matching ──────────────────────────────────────────
//
// Bridges two worlds that otherwise never talk to each other: `burgers.ingredients`
// (free-text labels typed in /menu, e.g. "Carne", "carne ") and `supplies.name`
// (the costing catalog, e.g. "Carne picada"). There's no foreign key between
// them — the normalized name is the only link, so matching has to tolerate
// case/accent/whitespace noise without silently picking the wrong supply.

// Lowercases, strips accents, and collapses surrounding/internal whitespace,
// so "Carne", "carne ", and "CARNE" all compare equal. Deliberately does NOT
// strip punctuation or pluralize — that's noise we haven't seen in practice,
// and guessing there would trade one silent-mismatch risk for another.
export function normalizeIngredientName(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritical marks
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export type IngredientMatchKind = "exact" | "approximate" | "ambiguous" | "none";

export interface IngredientSuggestion {
  ingredient: string; // the original /menu string, unmodified
  matchKind: IngredientMatchKind;
  supply: Supply | null; // pre-selected unless "ambiguous" or "none"
  candidates: Supply[]; // populates the picker when matchKind === "ambiguous"
}

// One ingredient's match against the active supply catalog. Order of checks
// matters: exact wins outright; when nothing is exact, substring inclusion
// (either direction) is tried — but only trusted as a pre-selected
// "approximate" match when it's unambiguous. Two or more inclusion
// candidates means we genuinely don't know which one is meant ("pan" could
// be "Pan brioche" or "Pan rallado") — that's "ambiguous", never guessed.
function matchIngredient(ingredient: string, activeSupplies: Supply[]): IngredientSuggestion {
  const normalizedIngredient = normalizeIngredientName(ingredient);

  const exact = activeSupplies.find(
    (s) => normalizeIngredientName(s.name) === normalizedIngredient
  );
  if (exact) {
    return { ingredient, matchKind: "exact", supply: exact, candidates: [exact] };
  }

  const included = activeSupplies.filter((s) => {
    const normalizedSupply = normalizeIngredientName(s.name);
    return (
      normalizedSupply.includes(normalizedIngredient) ||
      normalizedIngredient.includes(normalizedSupply)
    );
  });

  if (included.length === 1) {
    return { ingredient, matchKind: "approximate", supply: included[0], candidates: included };
  }
  if (included.length > 1) {
    return { ingredient, matchKind: "ambiguous", supply: null, candidates: included };
  }
  return { ingredient, matchKind: "none", supply: null, candidates: [] };
}

// Suggestions for the "Desde el menú" panel: only ingredients that don't
// already have a recipe line (by supply_id) are returned — the panel exists
// to fill in what's missing, not to re-offer lines the user already
// confirmed. Only `is_active` supplies are considered, matching the "add
// recipe line" picker's own filter (see EditRecipeDialog's `activeSupplies`).
export function buildIngredientSuggestions(
  ingredients: string[],
  supplies: Supply[],
  recipe: BurgerSupplyWithDetails[]
): IngredientSuggestion[] {
  const activeSupplies = supplies.filter((s) => s.is_active !== false);
  const recipeSupplyIds = new Set(recipe.map((line) => line.supply_id));

  return ingredients
    .map((ingredient) => matchIngredient(ingredient, activeSupplies))
    .filter((suggestion) => !(suggestion.supply && recipeSupplyIds.has(suggestion.supply.id)));
}

// ─── Cost breakdown, inventory value, usage & summary ──────────────────────

// Per-line share of a burger's total cost, sorted highest-impact first —
// answers "what's making this burger expensive". Mirrors (and is the real
// producer of) the `BurgerCost.breakdown` shape in lib/types/index.ts.
export function calculateCostBreakdown(
  lines: { quantity: number; supply: { id: string; name: string; unit: string; cost_per_unit: number } }[]
): BurgerCost["breakdown"] {
  const withCost = lines.map((line) => ({
    supplyId: line.supply.id,
    name: line.supply.name,
    unit: line.supply.unit,
    quantity: line.quantity,
    lineCost: line.quantity * Number(line.supply.cost_per_unit),
  }));

  const total = withCost.reduce((sum, line) => sum + line.lineCost, 0);

  // total === 0 (empty recipe, or every line costs $0) would make
  // lineCost / total a NaN — every share falls back to 0 instead.
  return withCost
    .map((line) => ({ ...line, share: total === 0 ? 0 : line.lineCost / total }))
    .sort((a, b) => b.lineCost - a.lineCost);
}

// Total $ value currently sitting on the shelf across the whole supply
// catalog — stock_quantity × cost_per_unit, summed.
export function calculateInventoryValue(
  supplies: { stock_quantity: number; cost_per_unit: number }[]
): number {
  return supplies.reduce(
    (sum, supply) => sum + Number(supply.stock_quantity) * Number(supply.cost_per_unit),
    0
  );
}

// How many recipes (burgers + extras) reference each supply at least once —
// powers the "Usado en" column in the supplies tab and the FK-violation
// delete message. Takes a list of recipes, each recipe itself a list of
// lines, so it can count usage across both burger and extra recipes without
// knowing either FK column name. A supply appearing twice in the same
// recipe (shouldn't happen, upsert is on (burger_id/extra_id, supply_id))
// would still only count that recipe once.
export function calculateSupplyUsage(recipes: { supply_id: string }[][]): Map<string, number> {
  const usage = new Map<string, number>();
  for (const lines of recipes) {
    const supplyIds = new Set(lines.map((line) => line.supply_id));
    for (const supplyId of supplyIds) {
      usage.set(supplyId, (usage.get(supplyId) ?? 0) + 1);
    }
  }
  return usage;
}

export interface RecipeSummary {
  avgUnitCost: number;
  avgMarginPct: number;
  belowTargetCount: number;
  withoutRecipeCount: number;
  withoutPriceCount: number;
}

// Aggregate stats for the /costos KPI row. A burger with zero recipe lines
// is "sin receta" — calculateMargin(basePrice, 0) would report a misleading
// 100% margin, so those burgers are excluded from both averages and counted
// separately instead. Same treatment for a burger that HAS a recipe but
// base_price <= 0: calculateMargin's basePrice<=0 guard reports 0% (not
// negative) for a real loss, which would silently pull avgMarginPct UP
// instead of down — excluded from the averages and counted separately so
// the KPI never lies in the direction that looks healthier than reality.
export function summarizeRecipes(
  burgers: {
    base_price: number;
    burger_supplies: {
      quantity: number;
      scales_with?: RecipeScaling | null;
      supply: { cost_per_unit: number };
    }[];
    default_meat_quantity?: number | null;
    default_fries_quantity?: number | null;
  }[],
  targetMarginPct: number
): RecipeSummary {
  let withoutRecipeCount = 0;
  let withoutPriceCount = 0;
  let belowTargetCount = 0;
  let costSum = 0;
  let marginSum = 0;
  let withRecipeCount = 0;

  for (const burger of burgers) {
    if (burger.burger_supplies.length === 0) {
      withoutRecipeCount++;
      continue;
    }
    if (burger.base_price <= 0) {
      withoutPriceCount++;
      continue;
    }
    const unitCost = calculateBurgerCost(
      resolveRecipeQuantities(burger.burger_supplies, scalingContextFromBurger(burger))
    );
    const margin = calculateMargin(burger.base_price, unitCost);
    withRecipeCount++;
    costSum += unitCost;
    marginSum += margin.percentage;
    if (margin.percentage < targetMarginPct) belowTargetCount++;
  }

  return {
    avgUnitCost: withRecipeCount > 0 ? costSum / withRecipeCount : 0,
    avgMarginPct: withRecipeCount > 0 ? marginSum / withRecipeCount : 0,
    belowTargetCount,
    withoutRecipeCount,
    withoutPriceCount,
  };
}

// ============================================
// BASE TYPES - Directamente de la DB
// ============================================

export type OrderStatus = "new" | "ready" | "completed" | "canceled"; // ❌ Eliminar "paid" (no está en DB)
export type ExtraCategory = "extra" | "drink" | "fries" | "sides";
export type DeliveryType = "pickup" | "delivery";
export type PaymentMethod = "cash" | "transfer";
export type DiscountType = "amount" | "percentage" | "none";
export type OrderSource = "local" | "pedidosya" | "web";

// ============================================
// CUSTOMER
// ============================================

export interface Customer {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  created_at: string;
}

export interface CustomerAddress {
  id: string;
  customer_id: string;
  label: string;
  address: string | null;
  is_default: boolean;
  notes: string | null;
  created_at: string;
}

// ============================================
// BURGERS
// ============================================

export interface Burger {
  id: string;
  name: string;
  description: string | null;
  base_price: number;
  ingredients: string[];
  is_available: boolean;
  image_url: string | null;
  default_meat_quantity: number; // Viene de DB como smallint
  default_fries_quantity: number; // Viene de DB como numeric
  created_at: string;
}

// ============================================
// EXTRAS
// ============================================

export interface Extra {
  id: string;
  name: string;
  category: ExtraCategory;
  price: number;
  is_available: boolean;
  created_at: string;
}

// ============================================
// ORDERS
// ============================================

export interface Order {
  id: string;
  order_number: number;
  customer_id: string | null;
  customer_name: string;
  customer?: { phone: string | null; customer_addresses?: CustomerAddress[] } | null;
  customer_address_id: string | null; // 🆕 Agregado de DB
  status: OrderStatus;
  is_paid: boolean;
  total_amount: number;
  delivery_type: DeliveryType; // 🆕 Agregado de DB
  delivery_fee: number; // 🆕 Agregado de DB
  payment_method: PaymentMethod; // 🆕 Agregado de DB
  delivery_time: string | null; // 🆕 AGREGAR
  discount_type: DiscountType | null; // 🆕 Agregado de DB
  discount_value: number; // 🆕 Agregado de DB
  discount_amount: number; // 🆕 Agregado de DB
  source: OrderSource | null; // 🆕 Agregado de DB
  commission_amount: number; // 🆕 Agregado de DB
  commission_rate: number | null; // 🆕 Agregado de DB — % congelado al crear el pedido
  price_adjustment: number; // 🆕 Agregado de DB — ajuste manual, solo PedidosYa
  delivery_zone_id: string | null; // 🆕 Agregado de DB
  delivery_zone_name: string | null; // 🆕 Agregado de DB
  delivery_fee_pending: boolean; // 🆕 Agregado de DB
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  burger_id: string | null; // 🆕 Puede ser null (si es combo)
  combo_id: string | null; // 🆕 Agregado de DB
  burger_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  customizations: string | null;
  created_at: string;
}

export interface OrderItemExtra {
  id: string;
  order_item_id: string;
  extra_id: string;
  extra_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  created_at: string;
}

// ============================================
// EXTENDED TYPES - Con relaciones
// ============================================

export interface OrderItemWithExtras extends OrderItem {
  extras: OrderItemExtra[];
}

export interface OrderWithItems extends Order {
  customer?: { phone: string | null } | null;
  customer_address?: CustomerAddress | null; // Nombre consistente con DB
  items: OrderItemWithExtras[];
}

// ============================================
// EXTERNAL INCOME
// ============================================

export interface ExternalIncome {
  id: string;
  date: string; // YYYY-MM-DD
  amount: number;
  description: string | null;
  created_at: string;
}

// ============================================
// EXPENSES
// ============================================

export type ExpenseCategory = "supplies" | "services" | "salaries" | "rent" | "other";
export type RecurringExpenseFrequency = "weekly" | "biweekly" | "monthly";

export interface Expense {
  id: string;
  date: string; // YYYY-MM-DD
  amount: number;
  category: ExpenseCategory;
  description: string | null;
  created_at: string;
  // Optional link to the supply this expense purchased — only meaningful
  // when category === 'supplies' and the user picked a specific supply
  // instead of leaving it as free text. See scripts/008-expense-supply-link.sql.
  supply_id?: string | null;
  quantity?: number | null;
}

export interface RecurringExpense {
  id: string;
  amount: number | null; // null for weekly/biweekly templates — informational-only, no fixed amount
  category: ExpenseCategory;
  description: string;
  frequency: RecurringExpenseFrequency;
  start_date: string; // YYYY-MM-DD
  end_date: string | null; // YYYY-MM-DD, null = still active
  created_at: string;
}

// ============================================
// SUPPLIES & RECIPES (COSTING)
// ============================================

// How the create/edit modal computed `cost_per_unit`, kept so re-editing a
// supply reopens the same inputs instead of just the derived result. See
// scripts/009-supply-purchase-basis.sql.
export type SupplyPurchaseMode = "unit" | "package" | "weight";

// Which configuration knob a burger_supplies line scales with. Unconstrained
// DB column (no CHECK), validated here instead — see
// scripts/014-burger-supply-scaling.sql for the storage semantics.
export type RecipeScaling = "meat" | "fries";

export interface Supply {
  id: string;
  name: string;
  unit: string;
  cost_per_unit: number;
  stock_quantity: number;
  is_active: boolean;
  created_at: string;
  // Grams that one unit of `unit` weighs, when this supply is tracked in a
  // discrete portion (e.g. "medallón") but purchased in bulk weight (kilos
  // of raw meat). Null for the common case: a supply already tracked in the
  // same unit it's purchased in. See scripts/007-supply-unit-weight.sql.
  unit_weight_grams: number | null;
  // Purchase-basis provenance for cost_per_unit. Null = legacy row, created
  // or last edited before this column existed — the UI treats that as
  // "unit" mode pre-filled with the existing cost_per_unit.
  purchase_mode?: SupplyPurchaseMode | null;
  // Package price ('package' mode) or price per kilo ('weight' mode). Null
  // in 'unit' mode and for legacy rows.
  purchase_price?: number | null;
  // Units per package. Only meaningful in 'package' mode.
  purchase_units?: number | null;
}

export interface BurgerSupply {
  id: string;
  burger_id: string;
  supply_id: string;
  quantity: number;
  created_at: string;
  // Which configuration knob this line scales with, if any. NULL means
  // "fixed quantity", the only behavior that existed before this column —
  // see scripts/014-burger-supply-scaling.sql.
  scales_with: RecipeScaling | null;
}

export interface BurgerSupplyWithDetails extends BurgerSupply {
  supply: Supply;
}

// Recipe (bill of materials) for an extra — mirrors BurgerSupply, minus
// scaling (extras have no meat/fries-quantity analogue to scale by). See
// scripts/013-extra-supplies.sql.
export interface ExtraSupply {
  id: string;
  extra_id: string;
  supply_id: string;
  quantity: number;
  created_at: string;
}

export interface ExtraSupplyWithDetails extends ExtraSupply {
  supply: Supply;
}

// The structural minimum every recipe-line consumer actually reads. Both
// BurgerSupplyWithDetails and ExtraSupplyWithDetails satisfy it structurally
// — it lets the costing helpers work on either kind of recipe without
// knowing which FK column backs it. `scales_with` is optional and
// burger-only (see scripts/014-burger-supply-scaling.sql) — an extra line
// simply never has it.
export interface RecipeLineWithDetails {
  id: string;
  supply_id: string;
  quantity: number;
  scales_with?: RecipeScaling | null;
  supply: Supply;
}

export interface ExtraWithRecipes extends Extra {
  extra_supplies: ExtraSupplyWithDetails[];
}

export interface BurgerCost {
  burgerId: string;
  unitCost: number;
  // Produced by calculateCostBreakdown() in lib/utils/costing.ts, sorted by
  // lineCost descending. `share` is lineCost / unitCost (0 for every line
  // when unitCost is 0, to avoid NaN).
  breakdown: {
    supplyId: string;
    name: string;
    unit: string;
    quantity: number;
    lineCost: number;
    share: number;
  }[];
}

// ============================================
// FRONTEND TYPES - Para el wizard
// ============================================

export type WizardStep = "customer" | "burgers" | "summary";

export interface OrderItemDraft {
  id: string;
  burger: Burger;
  quantity: number;
  meatCount: number;
  meatPriceAdjustment: number;
  removedIngredients: string[];
  selectedExtras: { extra: Extra; quantity: number }[];
}

// ============================================
// APP SETTINGS
// ============================================

// Singleton row — see scripts/018-app-settings.sql. Defaults mirrored in
// lib/settings/defaults.ts.
export interface AppSettings {
  business_name: string;
  pickup_address: string;
  whatsapp_template: string;
  delivery_template: string;
  default_delivery_fee: number;
  pedidosya_commission_pct: number;
  default_delivery_minutes: number;
  primary_color_light: string;
  primary_color_dark: string;
  logo_url: string | null;
}

// ============================================
// DELIVERY ZONES
// ============================================

// See scripts/019-delivery-zones.sql. Zones are soft-deleted only
// (is_active = false) — there is no delete mutation anywhere in this app,
// since orders.delivery_zone_id has no ON DELETE cascade.
export interface DeliveryZone {
  id: string;
  name: string;
  description: string | null;
  fee: number;
  is_active: boolean;
  sort_order: number;
  map_zone_key: string | null;
  // Hand-drawn shape on the same illustrated map (viewBox 0 0 1654 966), an
  // array of [x, y] point pairs. Nullable, independent of map_zone_key — see
  // scripts/020-delivery-zone-polygons.sql. A zone should never have both
  // set: saving a map_polygon must null out map_zone_key in the same
  // mutation ("graduating" off the 4 legacy fixed slots).
  map_polygon: [number, number][] | null;
  created_at: string;
  updated_at: string;
}

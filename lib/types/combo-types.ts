// ============================================
// COMBO TYPES - Basados en la estructura de DB
// ============================================

import { Burger, Extra } from ".";

export interface Combo {
  id: string;
  name: string;
  description: string | null;
  price: number;
  is_available: boolean;
  created_at: string;
}

export interface ComboSlotRule {
  id: number;
  combo_slot_id: string;
  rule_type: string | null;
  rule_value: string | null;
  created_at: string;
}

export interface ComboSlot {
  id: string;
  combo_id: string;
  slot_type: string; // "burger" | "drink" | "side" | "nuggets" (cualquier string en DB)
  quantity: number;
  required: boolean;
  default_meat_quantity: number | null;
  created_at: string;
}

export interface ComboSnapshot {
  id: string;
  name: string;
  price: number;
  description?: string | null;
  is_available?: boolean;
  created_at?: string;
  slots?: ComboSlotWithRules[];
}

// ============================================
// EXTENDED TYPES - Para uso en el frontend
// ============================================

// Reglas de un slot ya parseadas desde combo_slots_rules (clave/valor).
// Única definición: la comparten el combo de la DB y el slot seleccionado en el wizard.
export interface ComboSlotRules {
  min_quantity: number;
  max_quantity: number;
  allowed_meat_count?: number[];
  no_fries?: boolean;
  // Hamburguesa obligatoria: el slot queda fijo en esta burger (id)
  fixed_burger_id?: string;
}

export interface ComboSlotWithRules extends ComboSlot {
  rules: ComboSlotRules;
}

export interface ComboWithSlots extends Combo {
  slots: ComboSlotWithRules[];
}

// ============================================
// HELPER TYPES
// ============================================

// Tipos literales para slot_type (los que realmente usamos)
export type ComboSlotType = "burger" | "drink" | "side";

// Type guard para verificar slot_type
export function isValidSlotType(type: string): type is ComboSlotType {
  return ["burger", "drink", "side", "nuggets"].includes(type);
}

export interface SelectedBurger {
  id: string;
  burger: Burger;
  quantity: number;
  meatCount: number;
  friesQuantity: number;
  referenceFriesQuantity?: number; // Override para combos sin papas: evita descuento al calcular precio
  isVeggie?: boolean; // true = medallones veggies en lugar de carne
  removedIngredients: string[];
  selectedExtras: Array<{
    extra: Extra;
    quantity: number;
  }>;
  meatPriceAdjustment: number;
  locked?: boolean; // true = burger fija del combo: no se quita ni cambia su cantidad
}

/**
 * SelectedComboSlot - TIPO COMPARTIDO
 * Representa un slot dentro de un combo seleccionado
 */
export interface SelectedComboSlot {
  slotId: string;
  slotType: "burger" | "drink" | "side";
  defaultMeatCount?: number;
  maxQuantity: number;
  minQuantity: number;
  rules: ComboSlotRules;
  burgers: SelectedBurger[];
  selectedExtras: Extra[];
}

/**
 * SelectedCombo - TIPO COMPARTIDO
 * Representa un combo completo seleccionado en el wizard
 */
export interface SelectedCombo {
  id: string;
  combo: ComboWithSlots | ComboSnapshot; // 🆕 Acepta ambos
  quantity: number;
  slots: SelectedComboSlot[];
}

interface CreateComboSlotPayload {
  slot_type: string;
  quantity: number;
  default_meat_quantity?: number | null;
  required?: boolean;
  rules?: Array<{
    rule_type: string | null;
    rule_value: string | null;
  }>;
}

export interface CreateComboPayload {
  name: string;
  price: number;
  is_available: boolean;
  slots: CreateComboSlotPayload[];
}

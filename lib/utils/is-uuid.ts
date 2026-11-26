const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ADDRESS_SAVING_MESSAGE =
  "La dirección todavía se está guardando. Esperá un momento e intentá de nuevo.";

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_REGEX.test(value);
}

/**
 * Addresses created through the optimistic mutation in use-customers.ts carry
 * a client-side id ("optimistic-<uuid>") and `_optimistic: true` until the
 * server row replaces them. They must never be used as a foreign key.
 */
export function isOptimisticAddress(
  addr: { id?: string; _optimistic?: boolean } | null | undefined,
): boolean {
  if (!addr) return false;
  return addr._optimistic === true || String(addr.id ?? "").startsWith("optimistic-");
}

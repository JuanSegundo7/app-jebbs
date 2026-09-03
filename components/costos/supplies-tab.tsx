"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { SupplyFormDialog } from "@/components/costos/supply-form-dialog";
import {
  SupplyQuantityInput,
  resolveSupplyQuantity,
  type SupplyQuantityMode,
} from "@/components/costos/supply-quantity-input";
import { Edit, Plus, Trash2, ChevronLeft, ChevronRight, Search, Package } from "lucide-react";
import {
  useSupplies,
  useUpdateSupply,
  useDeleteSupply,
  useAllBurgersWithRecipes,
  useAllExtrasWithRecipes,
} from "@/lib/hooks/use-supplies";
import type { Supply } from "@/lib/types";
import { formatCurrency } from "@/lib/utils/format";
import { calculateInventoryValue, calculateSupplyUsage } from "@/lib/utils/costing";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 10;

// Supabase JS surfaces a Postgres FK violation (23503) with a `code` field
// on the thrown error, but the exact shape isn't guaranteed to survive every
// client version — fall back to a generic message if `code` isn't there.
function isForeignKeyViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "23503";
}

type StatusFilter = "all" | "active" | "out";

// "Sumar stock" — a purchase (e.g. 40kg of meat) adds to whatever is already
// on the shelf; it must never overwrite it the way the inline stock field
// does. Kept as its own popover with local state (not the tab-level
// `stockDrafts` map) since it doesn't share the inline field's draft/blur
// lifecycle — this is a one-shot "add N" action, not an editable value.
//
// When the supply has `unit_weight_grams` set (it's tracked in a discrete
// portion but purchased by weight — e.g. "medallón" bought as kilos of raw
// meat), a second mode appears: type kilos purchased and it converts to the
// portion count for you via calculateUnitsFromKilos, instead of making the
// user do that division by hand every time.
function RestockPopover({
  supply,
  isPending,
  onConfirm,
  triggerId,
}: {
  supply: Supply;
  isPending: boolean;
  onConfirm: (purchasedAmount: number) => void;
  triggerId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [mode, setMode] = useState<SupplyQuantityMode>("native");

  const resolvedAmount = resolveSupplyQuantity(supply, value, mode);

  function reset() {
    setValue("");
    setMode("native");
  }

  function handleConfirm() {
    if (!resolvedAmount) return;
    onConfirm(resolvedAmount);
    setOpen(false);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={triggerId}
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          aria-label={`Sumar stock a ${supply.name}`}
        >
          <Package className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="end">
        <p className="text-xs font-medium mb-2">Sumar al stock de {supply.name}</p>

        <SupplyQuantityInput
          supply={supply}
          value={value}
          mode={mode}
          onValueChange={setValue}
          onModeChange={setMode}
          inputClassName="h-8"
          autoFocus
          onEnter={handleConfirm}
        />

        <p className="mt-1.5 text-xs text-muted-foreground">
          Stock actual: {supply.stock_quantity} {supply.unit}
        </p>
        <Button
          size="sm"
          className="mt-2 h-7 w-full text-xs"
          onClick={handleConfirm}
          disabled={isPending || !resolvedAmount}
        >
          Sumar
        </Button>
      </PopoverContent>
    </Popover>
  );
}

export function SuppliesTab() {
  const { data: supplies, isLoading } = useSupplies();
  const { data: burgers } = useAllBurgersWithRecipes();
  const { data: extras } = useAllExtrasWithRecipes();
  const updateSupply = useUpdateSupply();
  const deleteSupply = useDeleteSupply();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSupply, setEditingSupply] = useState<Supply | null>(null);
  const [deletingSupply, setDeletingSupply] = useState<Supply | null>(null);
  const [deleteBlockedByFk, setDeleteBlockedByFk] = useState(false);
  // Draft map at the tab level (not per-row useState) so it survives a
  // refetch without going stale. Cleared per-key on successful commit source
  // switch (inline blur/Enter, or the edit dialog) so nothing masks a fresh value.
  const [stockDrafts, setStockDrafts] = useState<Record<string, string>>({});

  const usage = useMemo(
    () =>
      calculateSupplyUsage([
        ...(burgers ?? []).map((b) => b.burger_supplies),
        ...(extras ?? []).map((e) => e.extra_supplies),
      ]),
    [burgers, extras]
  );

  const existingUnits = useMemo(
    () => Array.from(new Set((supplies ?? []).map((s) => s.unit).filter(Boolean))),
    [supplies]
  );

  const filteredSupplies = useMemo(() => {
    if (!supplies) return [];
    const term = search.trim().toLowerCase();
    return supplies.filter((s) => {
      if (term && !s.name.toLowerCase().includes(term)) return false;
      if (statusFilter === "active" && !s.is_active) return false;
      if (statusFilter === "out" && s.stock_quantity > 0) return false;
      return true;
    });
  }, [supplies, search, statusFilter]);

  const totalPages = Math.ceil(filteredSupplies.length / PAGE_SIZE);
  const paginatedSupplies = filteredSupplies.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const inventoryTotal = useMemo(() => calculateInventoryValue(filteredSupplies), [filteredSupplies]);

  function setFilter(next: Partial<{ search: string; status: StatusFilter }>) {
    if (next.search !== undefined) setSearch(next.search);
    if (next.status !== undefined) setStatusFilter(next.status);
    setPage(1);
  }

  function openCreate() {
    setEditingSupply(null);
    setDialogOpen(true);
  }

  function openEdit(supply: Supply) {
    setEditingSupply(supply);
    setDialogOpen(true);
  }

  function commitStockDraft(supply: Supply) {
    const raw = stockDrafts[supply.id];
    if (raw === undefined) return;
    const parsed = parseFloat(raw.replace(",", "."));
    if (isNaN(parsed) || parsed === supply.stock_quantity) return;
    updateSupply.mutate(
      { id: supply.id, stock_quantity: parsed },
      {
        onSuccess: () => {
          toast.success("Stock actualizado");
        },
        onError: () => {
          setStockDrafts((d) => {
            const next = { ...d };
            delete next[supply.id];
            return next;
          });
          toast.error("Error al actualizar el stock");
        },
      }
    );
  }

  // Unions burger AND extra names that reference the supply being deleted —
  // a delete blocked purely by an extra's recipe must still show something
  // here, or the FK-blocked dialog looks broken (empty list) for that case.
  const productsUsingDeleting = useMemo(() => {
    if (!deletingSupply) return [];
    const burgerNames = (burgers ?? [])
      .filter((b) => b.burger_supplies.some((l) => l.supply_id === deletingSupply.id))
      .map((b) => b.name);
    const extraNames = (extras ?? [])
      .filter((e) => e.extra_supplies.some((l) => l.supply_id === deletingSupply.id))
      .map((e) => e.name);
    return [...burgerNames, ...extraNames];
  }, [deletingSupply, burgers, extras]);

  async function handleDelete() {
    if (!deletingSupply) return;
    try {
      await deleteSupply.mutateAsync(deletingSupply.id);
      toast.success("Insumo eliminado");
      setDeletingSupply(null);
      setDeleteBlockedByFk(false);
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        setDeleteBlockedByFk(true);
      } else {
        toast.error("Error al eliminar el insumo");
      }
      // Keep the dialog open so the user sees which item failed and why.
    }
  }

  async function handleDeactivateInstead() {
    if (!deletingSupply) return;
    try {
      await updateSupply.mutateAsync({ id: deletingSupply.id, is_active: false });
      toast.success("Insumo desactivado");
      setDeletingSupply(null);
      setDeleteBlockedByFk(false);
    } catch {
      toast.error("Error al desactivar el insumo");
    }
  }

  return (
    <>
      <Card id="costos-supplies-card" className="ios-glass bg-card">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium">Catálogo de insumos</p>
            <Button
              id="costos-add-supply-button"
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 text-xs"
              onClick={openCreate}
            >
              <Plus className="h-3.5 w-3.5" />
              Agregar
            </Button>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-3">
            <div className="flex items-center gap-1 rounded-xl border bg-card p-1 w-fit">
              <Button
                variant={statusFilter === "all" ? "default" : "ghost"}
                size="sm"
                className="rounded-lg h-7 px-3 text-xs"
                onClick={() => setFilter({ status: "all" })}
              >
                Todos
              </Button>
              <Button
                variant={statusFilter === "active" ? "default" : "ghost"}
                size="sm"
                className="rounded-lg h-7 px-3 text-xs"
                onClick={() => setFilter({ status: "active" })}
              >
                Activos
              </Button>
              <Button
                variant={statusFilter === "out" ? "default" : "ghost"}
                size="sm"
                className="rounded-lg h-7 px-3 text-xs"
                onClick={() => setFilter({ status: "out" })}
              >
                Sin stock
              </Button>
            </div>

            <div className="relative sm:max-w-xs">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar insumo..."
                className="h-8 pl-8 text-sm"
                value={search}
                onChange={(e) => setFilter({ search: e.target.value })}
              />
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          ) : !supplies || supplies.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Sin insumos cargados</p>
          ) : filteredSupplies.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Sin resultados para el filtro aplicado
            </p>
          ) : (
            <div className="space-y-2">
              {paginatedSupplies.map((supply, index) => (
                <div
                  key={supply.id}
                  className={cn(
                    "flex items-center gap-6 rounded-xl bg-muted/40 px-4 py-2.5",
                    !supply.is_active && "opacity-50"
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{supply.name}</p>
                    <span className="text-xs text-muted-foreground">
                      {supply.unit} · {usage.get(supply.id) ?? 0} recetas
                    </span>
                  </div>
                  <div className="w-28 text-right shrink-0">
                    <p className="text-sm font-semibold tabular-nums">
                      {formatCurrency(supply.cost_per_unit)}
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {formatCurrency(supply.stock_quantity * supply.cost_per_unit)} inv.
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="number"
                        step="0.001"
                        className="h-8 w-20 text-right tabular-nums"
                        style={supply.stock_quantity < 0 ? { color: "var(--status-canceled)" } : undefined}
                        aria-label={`Stock de ${supply.name}`}
                        value={stockDrafts[supply.id] ?? String(supply.stock_quantity)}
                        onChange={(e) =>
                          setStockDrafts((d) => ({ ...d, [supply.id]: e.target.value }))
                        }
                        onBlur={() => commitStockDraft(supply)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") e.currentTarget.blur();
                        }}
                      />
                      <span className="w-12 text-xs text-muted-foreground">{supply.unit}</span>
                    </div>
                    <RestockPopover
                      supply={supply}
                      // Tour target — only the first visible row needs the id
                      // (see components/onboarding/tours.tsx's "costos" tour
                      // and the header comment above the tours array).
                      triggerId={index === 0 ? "costos-restock-button" : undefined}
                      isPending={updateSupply.isPending}
                      onConfirm={(purchasedAmount) => {
                        const newStock = supply.stock_quantity + purchasedAmount;
                        updateSupply.mutate(
                          { id: supply.id, stock_quantity: newStock },
                          {
                            onSuccess: () => {
                              setStockDrafts((d) => {
                                const next = { ...d };
                                delete next[supply.id];
                                return next;
                              });
                              toast.success(
                                `Sumaste ${purchasedAmount} ${supply.unit} — stock: ${newStock} ${supply.unit}`
                              );
                            },
                            onError: () => toast.error("Error al sumar el stock"),
                          }
                        );
                      }}
                    />
                  </div>
                  <Switch
                    checked={supply.is_active}
                    onCheckedChange={(checked) =>
                      updateSupply.mutate(
                        { id: supply.id, is_active: checked },
                        {
                          onSuccess: () =>
                            toast.success(checked ? "Insumo activado" : "Insumo desactivado"),
                          onError: () => toast.error("Error al actualizar el insumo"),
                        }
                      )
                    }
                  />
                  <div className="flex gap-1 shrink-0">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(supply)}>
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => {
                        setDeletingSupply(supply);
                        setDeleteBlockedByFk(false);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}

              <div className="flex items-center justify-between border-t pt-2 mt-1 px-1">
                <span className="text-xs text-muted-foreground">Valor total del inventario</span>
                <span className="text-sm font-semibold tabular-nums">
                  {formatCurrency(inventoryTotal)}
                </span>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-1 px-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {page} / {totalPages}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Create / edit supply dialog ─── */}
      <SupplyFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editingSupply={editingSupply}
        existingUnits={existingUnits}
        onSaved={(supplyId) => {
          // Mirrors the old handleSubmit's cleanup: a fresh save should
          // never leave a stale inline-stock draft masking the value that
          // was just persisted. Harmless no-op for a brand-new supply (no
          // draft can exist yet for an id that didn't exist a moment ago).
          setStockDrafts((d) => {
            const next = { ...d };
            delete next[supplyId];
            return next;
          });
        }}
      />

      {/* ─── Delete supply confirm ─── */}
      <AlertDialog
        open={!!deletingSupply}
        onOpenChange={(open) => {
          if (!open) {
            setDeletingSupply(null);
            setDeleteBlockedByFk(false);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar insumo</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteBlockedByFk ? (
                <>
                  No se puede eliminar &quot;{deletingSupply?.name}&quot;: está en uso
                  {productsUsingDeleting.length > 0 ? (
                    <>
                      {" "}en{" "}
                      {productsUsingDeleting.length === 1
                        ? "esta receta de hamburguesa o extra"
                        : "estas recetas de hamburguesas o extras"}{" "}
                      — {productsUsingDeleting.join(", ")}
                    </>
                  ) : (
                    " en una receta"
                  )}
                  , o en el historial de pedidos completados que lo consumieron. Podés
                  desactivarlo en vez de eliminarlo: va a dejar de aparecer para agregarse a
                  recetas nuevas, sin romper las que ya lo usan.
                </>
              ) : (
                <>
                  ¿Eliminar &quot;{deletingSupply?.name}&quot;? Esta acción no se puede deshacer. Si el
                  insumo está usado en alguna receta o en el historial de pedidos completados, la
                  eliminación va a fallar.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            {deleteBlockedByFk ? (
              <AlertDialogAction onClick={handleDeactivateInstead}>
                Desactivar en vez de eliminar
              </AlertDialogAction>
            ) : (
              <AlertDialogAction className="bg-destructive" onClick={handleDelete}>
                Eliminar
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

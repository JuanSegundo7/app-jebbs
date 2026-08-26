"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { ChevronUp, ChevronDown, Search } from "lucide-react";
import { formatCurrency } from "@/lib/utils/format";
import { MARGIN_TARGET_DEFAULT } from "@/lib/utils/costing";

export type SortKey = "name" | "price" | "cost" | "margin" | "makeable";
export type SortDir = "asc" | "desc";

export interface RecipeTableRow {
  id: string;
  name: string;
  badge?: string | null; // e.g. an extra's category label; null/omitted for burgers
  salePrice: number;
  hasRecipe: boolean;
  unitCost: number;
  margin: { amount: number; percentage: number };
  makeable: { count: number | null; limitingSupplyId: string | null };
  limitingSupplyName: string | null;
}

export interface RecipeTableProps {
  cardId?: string;
  makeableHeaderId?: string; // only pass this for ONE of the two tables
  nameHeader: string;
  priceHeader: string;
  searchPlaceholder: string;
  emptyLabel: string; // shown when there are zero rows at all (not a search-empty state)
  search: string;
  onSearchChange: (value: string) => void;
  rows: RecipeTableRow[]; // UNFILTERED — this component owns its own search filter + sort
  isLoading: boolean;
  onRowClick: (id: string) => void;
}

function compareRows(a: RecipeTableRow, b: RecipeTableRow, sortKey: SortKey): number {
  switch (sortKey) {
    case "name":
      return a.name.localeCompare(b.name);
    case "price":
      return a.salePrice - b.salePrice;
    case "cost":
      return a.unitCost - b.unitCost;
    case "margin":
      return a.margin.percentage - b.margin.percentage;
    case "makeable":
      return (a.makeable.count ?? -1) - (b.makeable.count ?? -1);
  }
}

// Reusable sortable column header — replaces the one-off button JSX that
// used to be duplicated per column when only "Margen %" was sortable.
function SortableHead({
  id,
  label,
  sortKey,
  activeSortKey,
  sortDir,
  onSort,
  className,
}: {
  id?: string;
  label: string;
  sortKey: SortKey;
  activeSortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const isActive = activeSortKey === sortKey;
  return (
    <TableHead id={id} className={className}>
      <button
        type="button"
        className="flex items-center gap-1 hover:text-foreground"
        onClick={() => onSort(sortKey)}
      >
        {label}
        {isActive &&
          (sortDir === "asc" ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          ))}
      </button>
    </TableHead>
  );
}

// Generic sortable table for /costos' two recipe lists (burgers, extras).
// Owns its own sort state (fresh per mount, so the two tables sort
// independently) and its own search filter, fed by the `search` prop lifted
// to the parent so a single search box can drive it (see recipes-tab.tsx).
export function RecipeTable({
  cardId,
  makeableHeaderId,
  nameHeader,
  priceHeader,
  searchPlaceholder,
  emptyLabel,
  search,
  onSearchChange,
  rows,
  isLoading,
  onRowClick,
}: RecipeTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("margin");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) => row.name.toLowerCase().includes(term));
  }, [rows, search]);

  const sortedRows = useMemo(() => {
    return [...filteredRows].sort((a, b) => {
      const cmp = compareRows(a, b, sortKey);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filteredRows, sortKey, sortDir]);

  return (
    <Card id={cardId} className="ios-glass bg-card">
      <CardContent className="p-4">
        <div className="relative mb-3 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={searchPlaceholder}
            className="h-8 pl-8 text-sm"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">{emptyLabel}</p>
        ) : sortedRows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Sin resultados para tu búsqueda
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead
                  label={nameHeader}
                  sortKey="name"
                  activeSortKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
                <SortableHead
                  label={priceHeader}
                  sortKey="price"
                  activeSortKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
                <SortableHead
                  label="Costo"
                  sortKey="cost"
                  activeSortKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
                <SortableHead
                  label="Margen %"
                  sortKey="margin"
                  activeSortKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
                <SortableHead
                  id={makeableHeaderId}
                  label="Alcanza para"
                  sortKey="makeable"
                  activeSortKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedRows.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer"
                  onClick={() => onRowClick(row.id)}
                >
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-1.5">
                      <span>{row.name}</span>
                      {row.badge && (
                        <Badge variant="outline" className="text-xs">
                          {row.badge}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="tabular-nums">{formatCurrency(row.salePrice)}</TableCell>
                  <TableCell className="tabular-nums">{formatCurrency(row.unitCost)}</TableCell>
                  <TableCell className="tabular-nums">
                    {!row.hasRecipe ? (
                      <Badge variant="outline">Sin receta</Badge>
                    ) : row.salePrice <= 0 ? (
                      <Badge variant="outline">Sin precio</Badge>
                    ) : (
                      <div>
                        <p
                          className="font-semibold"
                          style={{
                            color:
                              row.margin.percentage >= MARGIN_TARGET_DEFAULT
                                ? "var(--status-paid)"
                                : "var(--status-canceled)",
                          }}
                        >
                          {row.margin.percentage.toFixed(1)}%
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatCurrency(row.margin.amount)}
                        </p>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {row.makeable.count === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <div>
                        <p
                          className="tabular-nums font-semibold"
                          style={
                            row.makeable.count === 0
                              ? { color: "var(--status-canceled)" }
                              : undefined
                          }
                        >
                          {row.makeable.count} u.
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          limita: {row.limitingSupplyName ?? "—"}
                        </p>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRowClick(row.id);
                      }}
                    >
                      Editar receta
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

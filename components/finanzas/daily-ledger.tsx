"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { CardHeading } from "@/components/ui/card-heading";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronLeft, ChevronRight, BookOpen, Download } from "lucide-react";
import { formatCurrency } from "@/lib/utils/format";
import { exportLedgerToPdf, exportLedgerToExcel } from "@/lib/utils/export-ledger";
import type { LedgerEntry } from "@/lib/hooks/orders/use-orders-history";

interface DailyLedgerProps {
  entries: LedgerEntry[] | undefined;
  closingBalance: number;
  isLoading: boolean;
  periodLabel: string;
  startDate: string;
  endDate: string;
}

const DAYS_PER_PAGE = 10;

function formatEntryDate(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
  });
}

export function DailyLedger({
  entries,
  closingBalance,
  isLoading,
  periodLabel,
  startDate,
  endDate,
}: DailyLedgerProps) {
  const [page, setPage] = useState(1);

  function handleExportPdf() {
    try {
      exportLedgerToPdf(entries ?? [], closingBalance, periodLabel, startDate, endDate);
      toast.success("Libro diario exportado");
    } catch {
      toast.error("No se pudo exportar el libro diario");
    }
  }

  async function handleExportExcel() {
    try {
      await exportLedgerToExcel(entries ?? [], closingBalance, periodLabel, startDate, endDate);
      toast.success("Libro diario exportado");
    } catch {
      toast.error("No se pudo exportar el libro diario");
    }
  }

  // Group entries by day, preserving the chronological order already
  // guaranteed by the hook (dailyData walked start -> end).
  const dayGroups = useMemo(() => {
    const groups: { date: string; entries: LedgerEntry[] }[] = [];
    for (const entry of entries ?? []) {
      const last = groups[groups.length - 1];
      if (last && last.date === entry.date) {
        last.entries.push(entry);
      } else {
        groups.push({ date: entry.date, entries: [entry] });
      }
    }
    return groups;
  }, [entries]);

  const totalPages = Math.max(1, Math.ceil(dayGroups.length / DAYS_PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const paginatedGroups = dayGroups.slice(
    (currentPage - 1) * DAYS_PER_PAGE,
    currentPage * DAYS_PER_PAGE
  );

  if (isLoading) {
    return (
      <Card className="mt-6 ios-glass bg-card">
        <CardContent className="p-4">
          <Skeleton className="h-64" />
        </CardContent>
      </Card>
    );
  }

  const isPositive = closingBalance >= 0;

  return (
    <Card className="mt-6 ios-glass p-0 bg-card">
      <CardContent className="p-4">
        <CardHeading
          icon={BookOpen}
          iconColor="var(--color-chart-2)"
          action={
            dayGroups.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs">
                    <Download className="h-3.5 w-3.5" />
                    Exportar
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleExportPdf}>Exportar PDF</DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExportExcel}>Exportar Excel</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )
          }
        >
          Libro diario
        </CardHeading>

        {dayGroups.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Sin movimientos en este período
          </p>
        ) : (
          <div className="space-y-3">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Concepto</TableHead>
                  <TableHead className="text-right">Debe</TableHead>
                  <TableHead className="text-right">Haber</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedGroups.map((group) =>
                  group.entries.map((entry, idx) => (
                    <TableRow key={`${entry.date}-${idx}-${entry.concept}`}>
                      <TableCell className="text-muted-foreground">
                        {idx === 0 ? formatEntryDate(group.date) : ""}
                      </TableCell>
                      <TableCell className="max-w-48 truncate">
                        <span className="flex items-center gap-1.5">
                          {entry.concept}
                          {entry.isProrated && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                              prorrateo
                            </Badge>
                          )}
                        </span>
                      </TableCell>
                      <TableCell
                        className="text-right tabular-nums"
                        style={{ color: entry.kind === "expense" ? "var(--status-canceled)" : undefined }}
                      >
                        {entry.kind === "expense" ? formatCurrency(entry.amount) : "—"}
                      </TableCell>
                      <TableCell
                        className="text-right tabular-nums"
                        style={{ color: entry.kind === "income" ? "var(--status-paid)" : undefined }}
                      >
                        {entry.kind === "income" ? formatCurrency(entry.amount) : "—"}
                      </TableCell>
                      <TableCell
                        className="text-right tabular-nums font-medium"
                        style={{
                          color: entry.balance >= 0 ? "var(--status-paid)" : "var(--status-canceled)",
                        }}
                      >
                        {formatCurrency(entry.balance)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            {/* Closing balance — sourced from the `closingBalance` prop
                (netRevenue), never re-summed from `entries` client-side. */}
            <div className="flex items-center justify-between rounded-xl bg-muted/40 px-4 py-3 border-t">
              <span className="text-sm font-medium">Saldo del período</span>
              <span
                className="text-base font-bold tabular-nums"
                style={{ color: isPositive ? "var(--status-paid)" : "var(--status-canceled)" }}
              >
                {formatCurrency(closingBalance)}
              </span>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-1 px-1">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-xs text-muted-foreground">
                  {currentPage} / {totalPages}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

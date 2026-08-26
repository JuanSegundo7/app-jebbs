"use client";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UsePeriodSelectorResult } from "@/lib/hooks/use-period-selector";

interface PeriodSelectorProps {
  period: UsePeriodSelectorResult;
  className?: string;
}

// Visual pills (Mes/Semana/Custom) + prev/next arrows or a Calendar range
// popover for the custom range — previously copy-pasted byte-for-byte across
// /gastos (x2) and /rendimiento. Pair with `usePeriodSelector()`.
export function PeriodSelector({ period, className }: PeriodSelectorProps) {
  const {
    viewMode,
    setViewMode,
    customRange,
    setCustomRange,
    calendarOpen,
    setCalendarOpen,
    calendarSelection,
    setCalendarSelection,
    periodLabel,
    handlePrev,
    handleNext,
  } = period;

  return (
    <div className={cn("mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between", className)}>
      <div className="flex items-center gap-1 rounded-xl border bg-card p-1 w-fit">
        <Button
          variant={viewMode === "month" ? "default" : "ghost"}
          size="sm"
          className="rounded-lg h-8 px-4 text-sm"
          onClick={() => setViewMode("month")}
        >
          Mes
        </Button>
        <Button
          variant={viewMode === "week" ? "default" : "ghost"}
          size="sm"
          className="rounded-lg h-8 px-4 text-sm"
          onClick={() => setViewMode("week")}
        >
          Semana
        </Button>
        <Button
          variant={viewMode === "custom" ? "default" : "ghost"}
          size="sm"
          className="rounded-lg h-8 px-4 text-sm"
          onClick={() => setViewMode("custom")}
        >
          Custom
        </Button>
      </div>

      {viewMode === "custom" ? (
        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="bg-card h-9 gap-2 text-sm font-medium">
              <CalendarIcon className="h-4 w-4" />
              {customRange ? periodLabel : "Elegir rango de fechas"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="range"
              selected={calendarSelection}
              onSelect={(range) => {
                setCalendarSelection(range);
                if (range?.from && range?.to) {
                  setCustomRange({ from: range.from, to: range.to });
                  setCalendarOpen(false);
                }
              }}
              numberOfMonths={2}
              disabled={{ after: new Date() }}
            />
          </PopoverContent>
        </Popover>
      ) : (
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={handlePrev} className="bg-card h-9 w-9">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-52 text-center text-sm font-medium capitalize tabular-nums">
            {periodLabel}
          </span>
          <Button variant="outline" size="icon" onClick={handleNext} className="bg-card h-9 w-9">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

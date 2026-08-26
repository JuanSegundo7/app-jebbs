"use client";

import { useState } from "react";
import type { DateRange } from "react-day-picker";
import type { ViewMode } from "@/lib/hooks/orders/use-orders-history";

export type { ViewMode };

export const TZ = "America/Argentina/Buenos_Aires";

export interface CustomRange {
  from: Date;
  to: Date;
}

function toArStr(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: TZ });
}

export function getPeriodDateStrs(
  selectedDate: Date,
  viewMode: ViewMode,
  customRange?: CustomRange
): { startDate: string; endDate: string } {
  if (viewMode === "custom" && customRange) {
    return { startDate: toArStr(customRange.from), endDate: toArStr(customRange.to) };
  }
  const arDate = new Date(selectedDate.toLocaleString("en-US", { timeZone: TZ }));
  if (viewMode === "week") {
    const day = arDate.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const monday = new Date(arDate);
    monday.setDate(arDate.getDate() + diffToMonday);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { startDate: toArStr(monday), endDate: toArStr(sunday) };
  }
  const year = arDate.getFullYear();
  const month = arDate.getMonth();
  const lastDate = new Date(year, month + 1, 0).getDate();
  return {
    startDate: `${year}-${String(month + 1).padStart(2, "0")}-01`,
    endDate: `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDate).padStart(2, "0")}`,
  };
}

export function getPeriodLabel(
  date: Date,
  mode: ViewMode,
  customRange?: CustomRange
): string {
  if (mode === "custom" && customRange) {
    const fmt = (d: Date) =>
      d.toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric", timeZone: TZ });
    return `${fmt(customRange.from)} – ${fmt(customRange.to)}`;
  }
  if (mode === "month") {
    return date.toLocaleDateString("es-AR", { month: "long", year: "numeric", timeZone: TZ });
  }
  const arDate = new Date(date.toLocaleString("en-US", { timeZone: TZ }));
  const day = arDate.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(arDate);
  monday.setDate(arDate.getDate() + diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString("es-AR", { day: "2-digit", month: "short", timeZone: TZ });
  return `${fmt(monday)} – ${fmt(sunday)}`;
}

export function navigate(date: Date, mode: ViewMode, direction: -1 | 1): Date {
  const newDate = new Date(date);
  if (mode === "month") {
    newDate.setMonth(newDate.getMonth() + direction);
  } else {
    newDate.setDate(newDate.getDate() + direction * 7);
  }
  return newDate;
}

export interface UsePeriodSelectorResult {
  selectedDate: Date;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  customRange: CustomRange | undefined;
  setCustomRange: (range: CustomRange | undefined) => void;
  calendarOpen: boolean;
  setCalendarOpen: (open: boolean) => void;
  calendarSelection: DateRange | undefined;
  setCalendarSelection: (range: DateRange | undefined) => void;
  startDate: string;
  endDate: string;
  periodLabel: string;
  handlePrev: () => void;
  handleNext: () => void;
}

// Shared period-selector state, previously duplicated across /gastos (x2)
// and /rendimiento. Owns view mode (month/week/custom), the anchor date,
// and the derived start/end date strings + display label — every consumer
// just reads `startDate`/`endDate`/`periodLabel` off the returned object.
export function usePeriodSelector(): UsePeriodSelectorResult {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [customRange, setCustomRange] = useState<CustomRange | undefined>(undefined);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarSelection, setCalendarSelection] = useState<DateRange | undefined>(undefined);

  const { startDate, endDate } = getPeriodDateStrs(selectedDate, viewMode, customRange);
  const periodLabel = getPeriodLabel(selectedDate, viewMode, customRange);

  const handlePrev = () => setSelectedDate((d) => navigate(d, viewMode, -1));
  const handleNext = () => setSelectedDate((d) => navigate(d, viewMode, 1));

  return {
    selectedDate,
    viewMode,
    setViewMode,
    customRange,
    setCustomRange,
    calendarOpen,
    setCalendarOpen,
    calendarSelection,
    setCalendarSelection,
    startDate,
    endDate,
    periodLabel,
    handlePrev,
    handleNext,
  };
}

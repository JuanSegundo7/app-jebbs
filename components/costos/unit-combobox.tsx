"use client";

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// Base suggestions shown even when the supplies table has few/no rows yet,
// so the picker isn't empty on a fresh catalog.
const SEED_UNITS = ["unidad", "gramo", "kilogramo", "mililitro", "litro"];

interface UnitComboboxProps {
  value: string;
  onChange: (value: string) => void;
  existingUnits: string[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

// `supplies.unit` is a free-text column on purpose (see
// scripts/003-costs-schema.sql) — units like "feta" are legitimate and an
// enum would break them. This combobox suggests known units to cut down on
// near-duplicates ("gr" vs "gramo"), but always lets the user type and
// commit a brand-new value instead of forcing a pick from the list.
export function UnitCombobox({
  value,
  onChange,
  existingUnits,
  placeholder = "Seleccionar unidad",
  disabled,
  className,
}: UnitComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const options = useMemo(() => {
    const merged = new Set([...SEED_UNITS, ...existingUnits.map((u) => u.trim()).filter(Boolean)]);
    return Array.from(merged).sort((a, b) => a.localeCompare(b, "es"));
  }, [existingUnits]);

  const trimmedSearch = search.trim();

  function selectUnit(unit: string) {
    onChange(unit);
    setSearch("");
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("h-9 w-full justify-between font-normal", className)}
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>
            {value || placeholder}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput
            placeholder="Buscar o crear unidad..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>
              {trimmedSearch ? (
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                  onClick={() => selectUnit(trimmedSearch)}
                >
                  <Plus className="h-4 w-4 shrink-0" />
                  Crear &quot;{trimmedSearch}&quot;
                </button>
              ) : (
                "Sin unidades"
              )}
            </CommandEmpty>
            <CommandGroup>
              {options.map((unit) => (
                <CommandItem key={unit} value={unit} onSelect={() => selectUnit(unit)}>
                  <Check
                    className={cn("h-4 w-4", value === unit ? "opacity-100" : "opacity-0")}
                  />
                  {unit}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ORDER_MESSAGE_VARS } from "@/lib/settings/variables";
import { findUsedPlaceholders } from "@/lib/utils/renderTemplate";

interface VariableChipsProps {
  template: string;
  onInsert: (name: string) => void;
  id?: string;
}

export function VariableChips({ template, onInsert, id }: VariableChipsProps) {
  const used = useMemo(() => new Set(findUsedPlaceholders(template)), [template]);

  return (
    <div id={id} className="flex flex-wrap gap-1.5">
      {ORDER_MESSAGE_VARS.map((v) => (
        <button
          key={v.name}
          type="button"
          onClick={() => onInsert(v.name)}
          title={`${v.label} · ej: ${v.example}`}
          className="cursor-pointer"
        >
          <Badge
            variant={used.has(v.name) ? "outline" : "secondary"}
            className={cn(
              "font-mono text-caption cursor-pointer transition-opacity",
              used.has(v.name) && "opacity-60",
            )}
          >
            {`{{${v.name}}}`}
          </Badge>
        </button>
      ))}
    </div>
  );
}

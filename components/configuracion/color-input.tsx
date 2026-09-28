"use client";

import { Input } from "@/components/ui/input";

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

interface ColorInputProps {
  label: string;
  hint?: string;
  value: string;
  onChange: (hex: string) => void;
  pickerAriaLabel: string;
}

// Native `type="color"` swatch + a validated hex field, extracted because
// apariencia-card.tsx had this block duplicated twice (light/dark accent)
// and was about to gain a third copy-pasted instance (background tint).
//
// Same validation regex each block already had before extraction: the
// native swatch always yields a valid 6-digit hex (no need to validate),
// the text field does — a half-typed hex does not fire onChange, so the
// input "bounces back" to the last valid value instead of propagating
// garbage into the parent's draft.
export function ColorInput({ label, hint, value, onChange, pickerAriaLabel }: ColorInputProps) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-secondary/30 p-3">
      <div>
        <p className="font-medium">{label}</p>
        {hint && <p className="text-caption text-muted-foreground">{hint}</p>}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-9 cursor-pointer rounded border border-input bg-transparent p-0.5"
          aria-label={pickerAriaLabel}
        />
        <Input
          type="text"
          value={value}
          onChange={(e) => {
            const next = e.target.value;
            if (HEX_RE.test(next)) onChange(next);
          }}
          className="w-24 font-mono text-caption"
        />
      </div>
    </div>
  );
}

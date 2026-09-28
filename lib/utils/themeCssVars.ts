// Maps the PURE results of deriveAccentPalette/deriveSurfaceTint to the
// custom property names that actually read them. A single place for that
// list keeps components/providers/theme-color-provider.tsx (which writes
// them on <html>) and components/configuracion/apariencia-card.tsx (which
// writes them ONLY on its preview container, never on
// document.documentElement) from ever diverging on which token corresponds
// to which palette field.
//
// jebbs-dashboard already had --accent-brand/-hover/-pressed/-contrast/
// -tint-08/16/32 as its own CSS vars (app/globals.css:49-55, 161-167), and
// --primary/--ring/--sidebar-primary/--sidebar-ring/--accent-foreground/
// --sidebar-primary-foreground already cascade from --accent-brand /
// --accent-contrast via `var(...)` in the stylesheet itself (globals.css:
// 74-90, 186-202) — setting them again here would be redundant, not a fix.
// The one token that does NOT cascade is --chart-1 (a hardcoded blue,
// globals.css:109/221), read by components/configuracion/
// delivery-zone-polygon-overlay.tsx, delivery-zone-map-preview.tsx and
// delivery-zone-polygon-editor-dialog.tsx — added here so the brand accent
// reaches those too instead of staying a fixed blue.

import type { AccentPalette } from "./deriveAccentPalette";
import type { SurfaceTintResult } from "./deriveSurfaceTint";

export function accentPaletteToCssVars(palette: AccentPalette): Record<string, string> {
  return {
    "--accent-brand": palette.accentBrand,
    "--accent-hover": palette.hover,
    "--accent-pressed": palette.pressed,
    "--accent-contrast": palette.contrast,
    "--accent-tint-08": palette.tint08,
    "--accent-tint-16": palette.tint16,
    "--accent-tint-32": palette.tint32,
    "--chart-1": palette.accentBrand,
  };
}

export const SURFACE_TINT_CSS_VARS = [
  "--surface-0",
  "--surface-1",
  "--surface-2",
  "--surface-3",
] as const;

// `tint` null => {} (nothing to set — the caller decides whether that means
// "leave alone" or "remove whatever was set before", see
// theme-color-provider.tsx).
export function surfaceTintToCssVars(tint: SurfaceTintResult | null): Record<string, string> {
  if (!tint) return {};
  return {
    "--surface-0": tint.surface0,
    "--surface-1": tint.surface1,
    "--surface-2": tint.surface2,
    "--surface-3": tint.surface3,
  };
}

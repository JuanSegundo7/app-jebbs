// Apariencia — background tint.
//
// Derives the 4 --surface-0..3 values mixed with a brand color the business
// picks (AppSettings.surface_tint). Replicates in JS what
// `color-mix(in srgb, <base> (100-ratio)%, <tint> ratio%)` would do in CSS,
// resolved here (not in CSS) so the result can also be shown in
// apariencia-card.tsx's preview without depending on the browser supporting
// color-mix() at runtime. Mixed per-channel, same approach
// deriveAccentPalette.ts already uses for `hover`/`pressed`.
//
// SCOPE IS DELIBERATELY NARROW: this ONLY computes --surface-0..3, the
// opaque planes. NEVER --material-thin/regular/thick nor --card/--popover/
// --sidebar (they derive from material, with alpha calibrated for
// legibility over blur) — mixing color there without also touching alpha
// breaks text contrast and the glass look. Callers (theme-color-provider.tsx,
// apariencia-card.tsx) must not use this result for anything but
// --surface-0..3.

import { hexToRgb, toHexChannel } from "./deriveAccentPalette";

export interface SurfaceTintResult {
  surface0: string;
  surface1: string;
  surface2: string;
  surface3: string;
}

// Literals mirrored from app/globals.css :root / .dark (lines 18-21 and
// 124-127) — HARDCODED here on purpose (not read from the DOM/computed
// style): this function is pure and must run server-side / in a test
// without `document`. If those literals change in globals.css, update them
// here too (same contract lib/settings/defaults.ts already has with
// scripts/018-app-settings.sql).
const SURFACE_BASE: Record<"light" | "dark", SurfaceTintResult> = {
  light: { surface0: "#eef0f3", surface1: "#f7f8fa", surface2: "#f2f3f5", surface3: "#e5e6ea" },
  dark: { surface0: "#08090c", surface1: "#101218", surface2: "#171a22", surface3: "#1f232d" },
};

// Fixed, low intensity: dark mode tolerates more before losing legibility
// than light mode does (same spirit as HOVER_MIX_RATIO_LIGHT/DARK in
// deriveAccentPalette.ts, which also differ by mode).
const TINT_RATIO_LIGHT = 0.06;
const TINT_RATIO_DARK = 0.1;

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function mixHex(baseHex: string, tintHex: string, ratio: number): string {
  const base = hexToRgb(baseHex);
  const tint = hexToRgb(tintHex);
  const r = base.r + (tint.r - base.r) * ratio;
  const g = base.g + (tint.g - base.g) * ratio;
  const b = base.b + (tint.b - base.b) * ratio;
  return `#${toHexChannel(r)}${toHexChannel(g)}${toHexChannel(b)}`;
}

// NULL/empty/invalid hex = "no tint". Returns `null` (identity for the
// caller: when null, theme-color-provider.tsx does NOT touch --surface-0..3
// and apariencia-card.tsx does NOT override the preview — in both cases the
// app/globals.css literals stand, exactly today's behavior).
export function deriveSurfaceTint(
  tintHex: string | null | undefined,
  mode: "light" | "dark",
): SurfaceTintResult | null {
  if (!tintHex || !HEX_RE.test(tintHex)) return null;

  const ratio = mode === "light" ? TINT_RATIO_LIGHT : TINT_RATIO_DARK;
  const base = SURFACE_BASE[mode];

  return {
    surface0: mixHex(base.surface0, tintHex, ratio),
    surface1: mixHex(base.surface1, tintHex, ratio),
    surface2: mixHex(base.surface2, tintHex, ratio),
    surface3: mixHex(base.surface3, tintHex, ratio),
  };
}

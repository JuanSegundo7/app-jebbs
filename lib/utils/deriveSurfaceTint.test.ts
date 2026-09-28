import { describe, expect, it } from "vitest";
import { deriveSurfaceTint } from "@/lib/utils/deriveSurfaceTint";

// Apariencia — background tint. Pure mix math, no DOM needed.
//
// Base literals mirrored from app/globals.css: light surface-0 #eef0f3,
// dark surface-0 #08090c (see app/globals.css:18-21 and :124-127).

describe("deriveSurfaceTint", () => {
  it("null/undefined/empty input passes through as 'no tint' (null)", () => {
    expect(deriveSurfaceTint(null, "light")).toBeNull();
    expect(deriveSurfaceTint(undefined, "light")).toBeNull();
    expect(deriveSurfaceTint("", "light")).toBeNull();
  });

  it("rejects an invalid hex the same way as 'no tint'", () => {
    expect(deriveSurfaceTint("not-a-color", "light")).toBeNull();
    expect(deriveSurfaceTint("#fff", "light")).toBeNull(); // 3-digit shorthand not supported
  });

  it("mixes at 6% in light mode against the literal light surface-0..3", () => {
    // base #eef0f3 (238,240,243) mixed 6% toward #ff0000 (255,0,0):
    //   r: 238 + 17*0.06   = 239.02 -> 239 -> ef
    //   g: 240 - 240*0.06  = 225.6  -> 226 -> e2
    //   b: 243 - 243*0.06  = 228.42 -> 228 -> e4
    const result = deriveSurfaceTint("#ff0000", "light");
    expect(result).not.toBeNull();
    expect(result!.surface0).toBe("#efe2e4");
  });

  it("mixes at 10% in dark mode against the literal dark surface-0..3", () => {
    // base #08090c (8,9,12) mixed 10% toward #00ff00 (0,255,0):
    //   r: 8 - 8*0.10    = 7.2   -> 7  -> 07
    //   g: 9 + 246*0.10  = 33.6  -> 34 -> 22
    //   b: 12 - 12*0.10  = 10.8  -> 11 -> 0b
    const result = deriveSurfaceTint("#00ff00", "dark");
    expect(result).not.toBeNull();
    expect(result!.surface0).toBe("#07220b");
  });

  it("returns all 4 surface values, each a valid 6-digit hex", () => {
    const result = deriveSurfaceTint("#7c3aed", "light");
    expect(result).not.toBeNull();
    for (const key of ["surface0", "surface1", "surface2", "surface3"] as const) {
      expect(result![key]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("clamps each channel within [base, tint] — never over/undershoots 0-255", () => {
    // Mixing toward pure white can only raise (or hold) each channel;
    // toward pure black can only lower (or hold) it. If a channel ever fell
    // outside that range, toHexChannel's Math.round would have produced a
    // value clipped by Math.max(0, Math.min(255, ...)) instead of the true
    // (now out-of-bounds) linear interpolation — this pins the paths that
    // exercise that clamp.
    const towardWhite = deriveSurfaceTint("#ffffff", "dark")!;
    const r0 = parseInt(towardWhite.surface0.slice(1, 3), 16);
    const g0 = parseInt(towardWhite.surface0.slice(3, 5), 16);
    const b0 = parseInt(towardWhite.surface0.slice(5, 7), 16);
    expect(r0).toBeGreaterThanOrEqual(0x08);
    expect(r0).toBeLessThanOrEqual(255);
    expect(g0).toBeGreaterThanOrEqual(0x09);
    expect(g0).toBeLessThanOrEqual(255);
    expect(b0).toBeGreaterThanOrEqual(0x0c);
    expect(b0).toBeLessThanOrEqual(255);

    const towardBlack = deriveSurfaceTint("#000000", "light")!;
    const r1 = parseInt(towardBlack.surface0.slice(1, 3), 16);
    expect(r1).toBeGreaterThanOrEqual(0);
    expect(r1).toBeLessThanOrEqual(0xee); // light surface-0's own r channel
  });
});

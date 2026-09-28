"use client";

import { useEffect, useState } from "react";
import { useSettings } from "@/lib/hooks/use-app-settings";
import { deriveAccentPalette } from "@/lib/utils/deriveAccentPalette";
import { deriveSurfaceTint } from "@/lib/utils/deriveSurfaceTint";
import { accentPaletteToCssVars, SURFACE_TINT_CSS_VARS, surfaceTintToCssVars } from "@/lib/utils/themeCssVars";

export function ThemeColorProvider({ children }: { children: React.ReactNode }) {
  const settings = useSettings();
  const [isDark, setIsDark] = useState(
    () => typeof document !== "undefined" && document.documentElement.classList.contains("dark"),
  );

  // No useTheme(): this provider must also work on /login, which has no
  // ThemeProvider. Reads the class straight off <html> (same fact
  // getInitialTheme() in theme-provider.tsx already relies on) and
  // re-subscribes to changes via a MutationObserver -- so it reacts if the
  // user toggles the theme while on the dashboard, where there IS a button
  // for that.
  useEffect(() => {
    const target = document.documentElement;
    const observer = new MutationObserver(() => {
      setIsDark(target.classList.contains("dark"));
    });
    observer.observe(target, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const baseHex = isDark ? settings.primary_color_dark : settings.primary_color_light;
    const palette = deriveAccentPalette(baseHex, isDark ? "dark" : "light");
    const root = document.documentElement.style;
    for (const [property, value] of Object.entries(accentPaletteToCssVars(palette))) {
      root.setProperty(property, value);
    }
  }, [settings.primary_color_light, settings.primary_color_dark, isDark]);

  // Background tint: ONLY --surface-0..3. `null` (no tint, the default)
  // removes any previous override instead of "doing nothing" -- so a
  // business that tries a tint and then removes it goes back cleanly to the
  // globals.css literals instead of being stuck with the last value left
  // dangling in <html>'s inline style.
  useEffect(() => {
    const tint = deriveSurfaceTint(settings.surface_tint, isDark ? "dark" : "light");
    const root = document.documentElement.style;
    if (tint) {
      for (const [property, value] of Object.entries(surfaceTintToCssVars(tint))) {
        root.setProperty(property, value);
      }
    } else {
      for (const property of SURFACE_TINT_CSS_VARS) {
        root.removeProperty(property);
      }
    }
  }, [settings.surface_tint, isDark]);

  return <>{children}</>;
}

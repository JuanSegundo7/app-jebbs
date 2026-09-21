"use client";

import { useEffect, useState } from "react";
import { useSettings } from "@/lib/hooks/use-app-settings";
import { deriveAccentPalette, type AccentPalette } from "@/lib/utils/deriveAccentPalette";

const PROPERTY_MAP: Record<keyof AccentPalette, string> = {
  accentBrand: "--accent-brand",
  hover: "--accent-hover",
  pressed: "--accent-pressed",
  contrast: "--accent-contrast",
  tint08: "--accent-tint-08",
  tint16: "--accent-tint-16",
  tint32: "--accent-tint-32",
};

export function ThemeColorProvider({ children }: { children: React.ReactNode }) {
  const settings = useSettings();
  const [isDark, setIsDark] = useState(
    () => typeof document !== "undefined" && document.documentElement.classList.contains("dark"),
  );

  // Sin useTheme(): este provider tiene que funcionar también en /login, que
  // no tiene ThemeProvider. Lee la clase directo del <html> (mismo hecho que
  // ya usa getInitialTheme() en theme-provider.tsx) y se re-suscribe a
  // cambios con un MutationObserver -- así reacciona si el usuario togglea
  // el tema mientras está en el dashboard, donde SÍ hay un botón para eso.
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
    for (const key of Object.keys(PROPERTY_MAP) as (keyof AccentPalette)[]) {
      root.setProperty(PROPERTY_MAP[key], palette[key]);
    }
  }, [settings.primary_color_light, settings.primary_color_dark, isDark]);

  return <>{children}</>;
}

// Deriva los 7 tokens de acento (--accent-brand y sus 6 derivados en
// app/globals.css:41-49,153-161) a partir de un único hex guardado por el
// usuario en /configuracion (AppSettings.primary_color_light /
// primary_color_dark).
//
// Esto es una APROXIMACIÓN de un sistema que originalmente fue elegido a
// mano, no una reconstrucción exacta. Los valores actuales de globals.css
// (#f57c00 en claro, #ff9f0a en oscuro, con hover/pressed/contraste
// ajustados manualmente color por color) fueron el único dato disponible
// para calibrar las reglas de abajo — con un color de usuario arbitrario,
// el resultado puede no verse tan pulido como el sistema hand-tuned
// original, pero se mantiene utilizable y con contraste de texto correcto.

export interface AccentPalette {
  accentBrand: string;
  hover: string;
  pressed: string;
  contrast: string;
  tint08: string;
  tint16: string;
  tint32: string;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.replace("#", "");
  const r = parseInt(normalized.substring(0, 2), 16);
  const g = parseInt(normalized.substring(2, 4), 16);
  const b = parseInt(normalized.substring(4, 6), 16);
  return { r, g, b };
}

function toHexChannel(value: number): string {
  const clamped = Math.max(0, Math.min(255, Math.round(value)));
  return clamped.toString(16).padStart(2, "0");
}

// Mezcla lineal en RGB hacia negro o blanco. ratio 0 = baseHex sin cambios,
// ratio 1 = target puro.
export function mix(hex: string, target: "black" | "white", ratio: number): string {
  const { r, g, b } = hexToRgb(hex);
  const targetValue = target === "black" ? 0 : 255;
  const mixedR = r + (targetValue - r) * ratio;
  const mixedG = g + (targetValue - g) * ratio;
  const mixedB = b + (targetValue - b) * ratio;
  return `#${toHexChannel(mixedR)}${toHexChannel(mixedG)}${toHexChannel(mixedB)}`;
}

export function rgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Luminancia relativa WCAG — https://www.w3.org/TR/WCAG20/#relativeluminancedef
function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

// Umbral calibrado contra los dos casos reales del sistema:
// relativeLuminance("#f57c00") ≈ 0.34 → texto blanco (modo claro)
// relativeLuminance("#ff9f0a") ≈ 0.46 → texto casi negro (modo oscuro)
const CONTRAST_LUMINANCE_THRESHOLD = 0.4;
const NEAR_BLACK_CONTRAST = "#180d00";
const WHITE_CONTRAST = "#ffffff";

const PRESSED_MIX_RATIO = 0.25;
const HOVER_MIX_RATIO_LIGHT = 0.12;
const HOVER_MIX_RATIO_DARK = 0.2;

export function deriveAccentPalette(baseHex: string, mode: "light" | "dark"): AccentPalette {
  // Pressed siempre oscurece, sin importar el modo -- es el estado
  // "hundido", más oscuro en cualquier fondo.
  const pressed = mix(baseHex, "black", PRESSED_MIX_RATIO);

  // Hover depende del modo -- en canvas oscuro, hover ACLARA
  // (ver comentario original en app/globals.css:156).
  const hover =
    mode === "light"
      ? mix(baseHex, "black", HOVER_MIX_RATIO_LIGHT)
      : mix(baseHex, "white", HOVER_MIX_RATIO_DARK);

  const contrast =
    relativeLuminance(baseHex) > CONTRAST_LUMINANCE_THRESHOLD
      ? NEAR_BLACK_CONTRAST
      : WHITE_CONTRAST;

  return {
    accentBrand: baseHex,
    hover,
    pressed,
    contrast,
    tint08: rgba(baseHex, 0.08),
    tint16: rgba(baseHex, 0.16),
    tint32: rgba(baseHex, 0.32),
  };
}

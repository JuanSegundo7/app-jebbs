"use client";

import type { DeliveryZone } from "@/lib/types";

// Read-only SVG layer that draws hand-drawn zone shapes (map_polygon) on top
// of the illustrated background map. Pure presentation — no drag/click
// handling of its own; that lives in DeliveryZonePolygonEditorDialog, which
// renders its own interactive overlay instead of reusing this one (simpler
// than parameterizing this component with edit-mode props).
interface DeliveryZonePolygonOverlayProps {
  zones: DeliveryZone[];
  hoveredZoneId: string | null;
  // Optional: when passed, this overlay becomes interactive (pointer events
  // enabled) and reports hover per-polygon. The read-only map preview passes
  // this; a future edit-mode consumer wouldn't need to.
  onHoverZone?: (id: string | null) => void;
}

const CHART_COLOR_VARS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
];

export function DeliveryZonePolygonOverlay({
  zones,
  hoveredZoneId,
  onHoverZone,
}: DeliveryZonePolygonOverlayProps) {
  // Color index is based on position among ALL zones that have some map
  // representation (legacy data-zone OR hand-drawn polygon), sorted by
  // sort_order -- not just the polygon zones -- so a zone's color stays
  // stable as other zones gain/lose shapes. Past 4 zones the palette repeats
  // (modulo 4); exact uniqueness beyond the 4 legacy colors isn't required.
  const zonesWithMapPresence = [...zones]
    .filter((z) => z.map_zone_key !== null || z.map_polygon !== null)
    .sort((a, b) => a.sort_order - b.sort_order);

  const polygonZones = zones.filter(
    (z): z is DeliveryZone & { map_polygon: [number, number][] } => z.map_polygon !== null,
  );

  return (
    // pointer-events-none SIEMPRE en la raíz -- antes se ponía en "auto"
    // para todo el <svg> apenas onHoverZone estaba presente, y eso tapaba
    // el mapa entero (incluidas las zonas legacy sin polígono) en cuanto
    // existía UN polígono, aunque el puntero estuviera sobre una zona sin
    // forma dibujada (reportado real: "ya no se resaltan las zonas... con
    // polígonos"). Cada <polygon> reactiva pointer-events por su cuenta
    // (mismo patrón que ya usa correctamente jebbs-landing), así que solo
    // captura hover sobre su propia forma, dejando pasar el resto al mapa
    // de fondo.
    <svg
      viewBox="0 0 1654 966"
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden="true"
    >
      {polygonZones.map((zone) => {
        const colorIndex = zonesWithMapPresence.findIndex((z) => z.id === zone.id);
        const color = CHART_COLOR_VARS[colorIndex < 0 ? 0 : colorIndex % CHART_COLOR_VARS.length];
        const isHovered = hoveredZoneId === zone.id;
        return (
          <polygon
            key={zone.id}
            points={zone.map_polygon.map(([x, y]) => `${x},${y}`).join(" ")}
            fill={color}
            fillOpacity={isHovered ? 0.45 : 0.22}
            stroke={color}
            strokeWidth={isHovered ? 3 : 1.5}
            className={onHoverZone ? "pointer-events-auto cursor-pointer" : undefined}
            onPointerEnter={onHoverZone ? () => onHoverZone(zone.id) : undefined}
            onPointerLeave={onHoverZone ? () => onHoverZone(null) : undefined}
          />
        );
      })}
    </svg>
  );
}

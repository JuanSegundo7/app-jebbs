"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/format";
import { useDeliveryMapSvgMarkup } from "@/lib/hooks/use-delivery-map-svg";
import { DeliveryZonePolygonOverlay } from "@/components/configuracion/delivery-zone-polygon-overlay";
import type { DeliveryZone } from "@/lib/types";

// Read-only companion to DeliveryZonesCard: mismo mapa que ya vive en
// jebbs-landing (components/landing/delivery-zone-map.tsx), portado acá
// para que el staff pueda confirmar visualmente que el mapa coincide con lo
// que se está cobrando, sin salir del dashboard. Sin click-to-select, sin
// edición desde el mapa -- eso quedó explícitamente fuera de alcance
// (el dueño eligió el scope chico sobre un editor de polígonos nuevo).
//
// No hace fetch propio de las zonas: el padre (ConfiguracionPage) ya llama
// useDeliveryZones() y nos pasa el resultado por prop. Duplicar la query acá
// sería una segunda fuente de verdad para el mismo array -- React Query ya
// dedupea por queryKey, así que llamar el hook de nuevo en el padre es
// gratis, pero mantener el fetch en un solo lugar (el padre) evita que este
// componente y el padre puedan mostrar snapshots distintos por un instante.
//
// "Live-updating" no necesita nada especial acá: useCreateDeliveryZone /
// useUpdateDeliveryZone / useDeactivateDeliveryZone (lib/hooks/use-delivery-zones.ts)
// ya invalidan ["delivery-zones"] al mutar, así que en cuanto cambia algo
// en DeliveryZonesCard, la prop `zones` que recibe este componente se
// actualiza sola y el mapa/leyenda se re-renderizan con datos frescos.
interface DeliveryZoneMapPreviewProps {
  zones: DeliveryZone[];
}

// Paleta categórica del dashboard (--chart-1..4, ya validada CVD-safe).
// public/delivery-zone-map.svg trae su propio <style> embebido con estos
// mismos hex hardcodeados por data-zone="z1".."z4" (3987e5/d95926/199e70/
// c98500) -- coinciden 1:1 con el valor "dark" de --chart-1..4 porque el
// dashboard es dark-mode-only. Referenciamos el token acá (para la leyenda)
// en vez de repetir el hex a mano; el color del path del SVG en sí sigue
// viniendo del propio archivo.
const MAP_ZONE_COLOR_VARS: Record<string, string> = {
  z1: "var(--chart-1)",
  z2: "var(--chart-2)",
  z3: "var(--chart-3)",
  z4: "var(--chart-4)",
};

export function DeliveryZoneMapPreview({ zones }: DeliveryZoneMapPreviewProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const svgMarkup = useDeliveryMapSvgMarkup();
  // Trackeado por id de zona (no por map_zone_key): una zona sin posición en
  // el mapa (map_zone_key === null) todavía necesita una identidad de hover
  // propia y estable, para que dos zonas sin key no se resalten juntas solo
  // por "compartir" el mismo valor null.
  const [hoveredZoneId, setHoveredZoneId] = useState<string | null>(null);
  const hoveredMapKey = zones.find((z) => z.id === hoveredZoneId)?.map_zone_key ?? null;

  // Delegación de eventos sobre el contenedor: los <path data-zone="z1">
  // etc. ya vienen con ese atributo desde el SVG, no hace falta parsear los
  // paths a mano, solo escuchar bubbling. `.zone-off` (globals.css) ya trae
  // pointer-events: none, así que una zona apagada no dispara este handler.
  useEffect(() => {
    const container = mapRef.current;
    if (!container || !svgMarkup) return;

    const handleOver = (e: Event) => {
      const target = (e.target as Element).closest("[data-zone]");
      const mapKey = target?.getAttribute("data-zone");
      const zone = mapKey ? zones.find((z) => z.map_zone_key === mapKey) : null;
      if (zone) setHoveredZoneId(zone.id);
    };
    const handleLeave = () => setHoveredZoneId(null);

    container.addEventListener("pointerover", handleOver);
    container.addEventListener("pointerleave", handleLeave);
    return () => {
      container.removeEventListener("pointerover", handleOver);
      container.removeEventListener("pointerleave", handleLeave);
    };
  }, [svgMarkup, zones]);

  // Única fuente de verdad para el estado de hover -- arranque en el mapa o
  // en una fila de la leyenda, este efecto sincroniza `.dim` (ya definida en
  // el <style> embebido del propio SVG) sobre los paths reales. También
  // aplica `.zone-off` (globals.css) a cualquier data-zone que no matchee el
  // map_zone_key de ninguna zona ACTIVA hoy -- a diferencia de la referencia
  // en jebbs-landing (que recibe solo zonas activas del catálogo), acá
  // useDeliveryZones() trae todas las zonas, activas e inactivas, así que
  // filtramos por is_active explícitamente: desactivar una zona desde
  // DeliveryZonesCard debe apagar su posición en el mapa en vivo, no solo
  // dejar de cobrarla.
  useEffect(() => {
    const container = mapRef.current;
    if (!container) return;
    const activeMapKeys = new Set(
      zones
        .filter((z) => z.is_active)
        .map((z) => z.map_zone_key)
        .filter((key): key is string => key !== null),
    );
    const zoneEls = container.querySelectorAll<SVGElement>("[data-zone]");
    zoneEls.forEach((el) => {
      const mapKey = el.getAttribute("data-zone");
      const isKnown = mapKey !== null && activeMapKeys.has(mapKey);
      el.classList.toggle("zone-off", !isKnown);
      const isOther = hoveredMapKey !== null && mapKey !== hoveredMapKey;
      el.classList.toggle("dim", isKnown && isOther);
    });
  }, [hoveredMapKey, svgMarkup, zones]);

  const sortedZones = [...zones].sort((a, b) => {
    if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.name.localeCompare(b.name);
  });

  // Mismo criterio de indexado que DeliveryZonePolygonOverlay: posición
  // entre todas las zonas con ALGUNA presencia en el mapa (legacy
  // map_zone_key o map_polygon dibujado a mano), ordenadas por sort_order,
  // ciclando la paleta de 4 colores -- así el punto de la leyenda coincide
  // con el color que realmente se dibuja en el mapa para zonas nuevas.
  const zonesWithMapPresence = [...zones]
    .filter((z) => z.map_zone_key !== null || z.map_polygon !== null)
    .sort((a, b) => a.sort_order - b.sort_order);
  const CHART_COLOR_LIST = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)"];
  const colorForZone = (zone: DeliveryZone): string | null => {
    if (zone.map_zone_key) return MAP_ZONE_COLOR_VARS[zone.map_zone_key];
    if (zone.map_polygon) {
      const index = zonesWithMapPresence.findIndex((z) => z.id === zone.id);
      return CHART_COLOR_LIST[index < 0 ? 0 : index % CHART_COLOR_LIST.length];
    }
    return null;
  };

  return (
    <Card className="bg-card">
      <CardHeader>
        <CardTitle>Vista previa del mapa</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-caption text-muted-foreground -mt-1">
          Así se ve hoy el mapa de zonas que usan los clientes al pedir por la web. Pasá el mouse
          para ver qué fila corresponde a cada zona del mapa.
        </p>

        <div className="delivery-zone-map relative overflow-x-auto rounded-lg border border-input bg-secondary/30 p-2">
          <div
            ref={mapRef}
            className="[&_svg]:block [&_svg]:h-auto [&_svg]:w-full [&_svg]:min-w-[480px]"
            // Markup propio, servido por nosotros mismos desde public/, no
            // contenido de usuario (mismo criterio que jebbs-landing).
            dangerouslySetInnerHTML={svgMarkup ? { __html: svgMarkup } : undefined}
            aria-label="Vista previa del mapa de zonas de envío"
            role="img"
          />
          {/* Capa independiente para zonas con forma dibujada a mano
              (map_polygon) -- convive con el resaltado legacy data-zone de
              arriba sin pisarlo, son sistemas visualmente separados. */}
          <DeliveryZonePolygonOverlay
            zones={zones}
            hoveredZoneId={hoveredZoneId}
            onHoverZone={setHoveredZoneId}
          />
        </div>

        <ul className="space-y-1">
          {sortedZones.length === 0 && (
            <li className="text-caption text-muted-foreground">Sin zonas activas todavía</li>
          )}
          {sortedZones.map((zone) => {
            // Inactiva pesa más que "sin mapa" -- una zona desactivada ya
            // se ve apagada por su propia razón, no hay que sumar los dos
            // efectos. Solo el punto de color distinguía antes una zona sin
            // map_zone_key (queda con --muted-foreground-dim); la fila
            // entera ahora también se atenúa (feedback real: "deberían
            // verse más grisáceas").
            const hasMapShape = zone.map_zone_key !== null || zone.map_polygon !== null;
            const rowOpacity = !zone.is_active
              ? "opacity-50"
              : !hasMapShape
                ? "opacity-70"
                : "";
            return (
            <li
              key={zone.id}
              className={[
                "flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-caption transition-colors",
                hoveredZoneId === zone.id ? "bg-secondary/60" : "",
                rowOpacity,
              ]
                .filter(Boolean)
                .join(" ")}
              onPointerEnter={() => setHoveredZoneId(zone.id)}
              onPointerLeave={() => setHoveredZoneId(null)}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{
                    backgroundColor: colorForZone(zone) ?? "var(--muted-foreground-dim)",
                  }}
                  aria-hidden="true"
                />
                <span className="truncate font-medium">{zone.name}</span>
                {!hasMapShape && (
                  <span className="shrink-0 text-muted-foreground/70">(sin mapa)</span>
                )}
              </span>
              <span className="shrink-0 font-medium text-muted-foreground">
                {formatCurrency(zone.fee)}
              </span>
            </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

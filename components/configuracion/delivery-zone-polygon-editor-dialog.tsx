"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useUpdateDeliveryZone } from "@/lib/hooks/use-delivery-zones";
import { useDeliveryMapSvgMarkup } from "@/lib/hooks/use-delivery-map-svg";
import type { DeliveryZone } from "@/lib/types";

interface DeliveryZonePolygonEditorDialogProps {
  zone: DeliveryZone;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MIN_POINTS = 3;

// Converts a browser pointer event to this SVG's own coordinate space via
// the SVG's native CTM, NOT manual bounding-rect math -- manual math breaks
// as soon as the rendered box's aspect ratio differs from the viewBox's,
// which the `w-full h-auto` scaling used everywhere on this map can and
// does cause.
function toSvgPoint(svg: SVGSVGElement, clientX: number, clientY: number): [number, number] | null {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const transformed = pt.matrixTransform(ctm.inverse());
  return [transformed.x, transformed.y];
}

export function DeliveryZonePolygonEditorDialog({
  zone,
  open,
  onOpenChange,
}: DeliveryZonePolygonEditorDialogProps) {
  const svgMarkup = useDeliveryMapSvgMarkup();
  const updateZone = useUpdateDeliveryZone();

  const overlayRef = useRef<SVGSVGElement>(null);
  const [points, setPoints] = useState<[number, number][]>(zone.map_polygon ?? []);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);

  // Reset local draft whenever the dialog opens (or opens for a different
  // zone) -- keyed on [zone.id, open] so a cancel doesn't leave stale
  // in-progress points around for the next time it's opened.
  useEffect(() => {
    if (open) {
      setPoints(zone.map_polygon ?? []);
      setDraggingIndex(null);
    }
  }, [zone.id, open, zone.map_polygon]);

  const hadPolygonOnOpen = zone.map_polygon !== null;

  // Adding a point: clicking anywhere on the overlay that isn't already a
  // vertex handle. Vertex pointerdown calls stopPropagation, so this never
  // fires as a side effect of starting a drag.
  const handleBackgroundPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const svg = overlayRef.current;
    if (!svg) return;
    const next = toSvgPoint(svg, e.clientX, e.clientY);
    if (!next) return;
    setPoints((prev) => [...prev, next]);
  };

  const handleVertexPointerDown = (index: number) => (e: React.PointerEvent<SVGCircleElement>) => {
    e.stopPropagation();
    setDraggingIndex(index);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleVertexPointerMove = (index: number) => (e: React.PointerEvent<SVGCircleElement>) => {
    if (draggingIndex !== index) return;
    const svg = overlayRef.current;
    if (!svg) return;
    const next = toSvgPoint(svg, e.clientX, e.clientY);
    if (!next) return;
    setPoints((prev) => prev.map((p, i) => (i === index ? next : p)));
  };

  const handleVertexPointerUp = (e: React.PointerEvent<SVGCircleElement>) => {
    e.stopPropagation();
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setDraggingIndex(null);
  };

  const deleteVertex = (index: number) => {
    if (points.length <= MIN_POINTS) {
      toast.error(`Una zona necesita al menos ${MIN_POINTS} puntos para formar una figura`);
      return;
    }
    setPoints((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    if (points.length < MIN_POINTS) {
      toast.error("Dibujá al menos 3 puntos para cerrar una forma");
      return;
    }
    // "Graduar" la zona fuera del sistema legacy de 4 slots fijos siempre
    // que se guarda una forma dibujada a mano -- map_zone_key: null va
    // siempre en este mutate, incluso si la zona nunca tuvo uno asignado
    // (no-op inofensivo en ese caso), para que nunca queden dos
    // representaciones de mapa compitiendo para la misma zona.
    updateZone.mutate(
      { id: zone.id, map_polygon: points, map_zone_key: null },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  const handleClearShape = () => {
    updateZone.mutate(
      { id: zone.id, map_polygon: null },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  const shapeIsClosed = points.length >= MIN_POINTS;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Dibujar forma: {zone.name}</DialogTitle>
        </DialogHeader>

        <p className="text-caption text-muted-foreground -mt-2">
          Hacé click sobre el mapa para agregar puntos. Arrastrá un punto ya puesto para
          ajustarlo. Necesitás al menos {MIN_POINTS} puntos para formar una figura.
        </p>

        <div className="relative overflow-hidden rounded-lg border border-input bg-secondary/30">
          <div
            className="[&_svg]:block [&_svg]:h-auto [&_svg]:w-full [&_svg]:min-w-[480px]"
            dangerouslySetInnerHTML={svgMarkup ? { __html: svgMarkup } : undefined}
            aria-hidden="true"
          />
          <svg
            ref={overlayRef}
            viewBox="0 0 1654 966"
            className="absolute inset-0 h-full w-full cursor-crosshair touch-none"
            onPointerDown={handleBackgroundPointerDown}
          >
            {shapeIsClosed ? (
              <polygon
                points={points.map(([x, y]) => `${x},${y}`).join(" ")}
                fill="var(--chart-1)"
                fillOpacity={0.25}
                stroke="var(--chart-1)"
                strokeWidth={2}
              />
            ) : (
              points.length > 1 && (
                <polyline
                  points={points.map(([x, y]) => `${x},${y}`).join(" ")}
                  fill="none"
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                />
              )
            )}
            {points.map(([x, y], index) => (
              <circle
                key={index}
                cx={x}
                cy={y}
                r={8}
                fill="var(--chart-1)"
                stroke="var(--background)"
                strokeWidth={2}
                className="cursor-grab touch-none"
                onPointerDown={handleVertexPointerDown(index)}
                onPointerMove={handleVertexPointerMove(index)}
                onPointerUp={handleVertexPointerUp}
              />
            ))}
          </svg>
        </div>

        {points.length > 0 && (
          <ul className="max-h-32 space-y-1 overflow-y-auto">
            {points.map(([x, y], index) => (
              <li
                key={index}
                className="flex items-center justify-between gap-3 rounded-md bg-secondary/30 px-2 py-1 text-caption"
              >
                <span>
                  Vértice {index + 1} ({Math.round(x)}, {Math.round(y)})
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  onClick={() => deleteVertex(index)}
                  disabled={points.length <= MIN_POINTS}
                  title="Borrar vértice"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <DialogFooter className="sm:justify-between">
          <div>
            {hadPolygonOnOpen && (
              <Button
                variant="ghost"
                className="text-destructive"
                onClick={handleClearShape}
                disabled={updateZone.isPending}
              >
                Borrar forma
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={updateZone.isPending}>
              Guardar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

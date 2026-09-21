"use client";

import { useEffect, useState } from "react";

// Fetches the illustrated delivery-zone map once and hands back its raw
// markup for `dangerouslySetInnerHTML`. Extracted out of
// DeliveryZoneMapPreview so the polygon editor dialog (which needs the same
// background image but none of the preview's hover/data-zone wiring) doesn't
// have to duplicate the fetch.
export function useDeliveryMapSvgMarkup() {
  const [svgMarkup, setSvgMarkup] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/delivery-zone-map.svg")
      .then((res) => res.text())
      .then((text) => {
        if (!cancelled) setSvgMarkup(text);
      })
      .catch(() => {
        // Falla silenciosa a propósito, mismo criterio que antes: si el
        // fetch no anda, el consumidor simplemente no muestra el mapa.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return svgMarkup;
}

"use client";

import { DeliveryZonesCard } from "@/components/configuracion/delivery-zones-card";
import { DeliveryZoneMapPreview } from "@/components/configuracion/delivery-zone-map-preview";
import { useDeliveryZones } from "@/lib/hooks/use-delivery-zones";

export function EnviosTab() {
  // Misma queryKey que DeliveryZonesCard (lib/hooks/use-delivery-zones.ts) --
  // React Query dedupea por queryKey, así que esto no es un segundo
  // round-trip de red, solo una segunda suscripción al mismo cache. Se
  // prefiere sobre prop-drilling a través de DeliveryZonesCard porque así
  // ambos componentes leen la misma fuente de verdad directamente.
  const { data: deliveryZones } = useDeliveryZones();

  return (
    <div className="space-y-6">
      <DeliveryZoneMapPreview zones={deliveryZones ?? []} />
      <DeliveryZonesCard />
    </div>
  );
}

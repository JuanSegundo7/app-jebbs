"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Check, X, Plus, Map } from "lucide-react";
import { toast } from "sonner";
import {
  useDeliveryZones,
  useCreateDeliveryZone,
  useUpdateDeliveryZone,
  useDeactivateDeliveryZone,
} from "@/lib/hooks/use-delivery-zones";
import { formatCurrency } from "@/lib/utils/format";
import { DeliveryZonePolygonEditorDialog } from "@/components/configuracion/delivery-zone-polygon-editor-dialog";
import type { DeliveryZone } from "@/lib/types";

const MAP_ZONE_KEY_OPTIONS = ["z1", "z2", "z3", "z4"] as const;
const NONE_VALUE = "__none__";

export function DeliveryZonesCard() {
  const { data: zones } = useDeliveryZones();
  const createZone = useCreateDeliveryZone();
  const updateZone = useUpdateDeliveryZone();
  const deactivateZone = useDeactivateDeliveryZone();

  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newFee, setNewFee] = useState("");

  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [feeInput, setFeeInput] = useState("");

  // Mismo patrón que editingZoneId/feeInput arriba, para nombre+descripción
  // -- estado aparte porque una fila puede tener uno de los dos modos de
  // edición abierto a la vez, nunca los dos (feedback real: el precio ya se
  // podía editar, el nombre no tenía forma de corregirse después de crear
  // la zona).
  const [editingNameZoneId, setEditingNameZoneId] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState("");
  const [descriptionInput, setDescriptionInput] = useState("");

  // Zona cuyo diálogo de "dibujar forma" está abierto -- parte nueva de
  // scripts/020-delivery-zone-polygons.sql, coexiste con el Select de
  // map_zone_key legacy de abajo, no lo reemplaza.
  const [editingShapeZone, setEditingShapeZone] = useState<DeliveryZone | null>(null);

  const startAdd = () => {
    setNewName("");
    setNewDescription("");
    setNewFee("");
    setIsAdding(true);
  };

  const cancelAdd = () => {
    setIsAdding(false);
  };

  const saveAdd = () => {
    const name = newName.trim();
    const fee = Number(newFee.trim().replace(",", "."));

    if (!name) {
      toast.error("Ingresá un nombre válido");
      return;
    }
    if (!Number.isFinite(fee) || fee < 0) {
      toast.error("Ingresá un costo válido");
      return;
    }

    createZone.mutate(
      {
        name,
        description: newDescription.trim() || null,
        fee,
      },
      {
        onSuccess: () => setIsAdding(false),
      },
    );
  };

  const startEditFee = (zone: DeliveryZone) => {
    setFeeInput(String(zone.fee));
    setEditingZoneId(zone.id);
  };

  const cancelEditFee = () => {
    setEditingZoneId(null);
    setFeeInput("");
  };

  const saveEditFee = (zone: DeliveryZone) => {
    const parsed = Number(feeInput.trim().replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0) {
      toast.error("Ingresá un costo válido");
      return;
    }
    updateZone.mutate({ id: zone.id, fee: parsed });
    setEditingZoneId(null);
  };

  const startEditName = (zone: DeliveryZone) => {
    setNameInput(zone.name);
    setDescriptionInput(zone.description ?? "");
    setEditingNameZoneId(zone.id);
  };

  const cancelEditName = () => {
    setEditingNameZoneId(null);
    setNameInput("");
    setDescriptionInput("");
  };

  const saveEditName = (zone: DeliveryZone) => {
    const name = nameInput.trim();
    if (!name) {
      toast.error("Ingresá un nombre válido");
      return;
    }
    updateZone.mutate({ id: zone.id, name, description: descriptionInput.trim() || null });
    setEditingNameZoneId(null);
  };

  const toggleActive = (zone: DeliveryZone, checked: boolean) => {
    if (checked) {
      updateZone.mutate({ id: zone.id, is_active: true });
    } else {
      deactivateZone.mutate(zone.id);
    }
  };

  const changeMapZoneKey = (zone: DeliveryZone, value: string) => {
    updateZone.mutate({
      id: zone.id,
      map_zone_key: value === NONE_VALUE ? null : value,
    });
  };

  const sortedZones = [...(zones ?? [])].sort((a, b) => {
    if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
    return 0;
  });

  return (
    <Card className="bg-card">
      <CardHeader>
        <CardTitle>Zonas de envío</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-caption text-muted-foreground -mt-1">
          El cliente elige su zona al pedir por la web y se le cobra el costo de acá
        </p>
        <p className="text-caption text-muted-foreground/70 -mt-2">
          El selector de la derecha ("Zona 1", "Zona 2"...) conecta la fila con el dibujo del mapa
          de envíos de la web -- no afecta el precio. Dejalo en "Ninguna" si todavía no tiene un
          polígono dibujado en el mapa (igual va a aparecer para elegir en el pedido).
        </p>

        {sortedZones.map((zone) =>
          editingNameZoneId === zone.id ? (
            // Fila entera pasa a modo edición vertical (mismo criterio
            // visual que el bloque "Agregar zona" más abajo) en vez de
            // meter dos inputs en la columna angosta del nombre -- es el
            // mismo problema de espacio que ya se arregló para la fila de
            // solo lectura (min-w-[140px]/flex-wrap), reintroducirlo acá
            // con dos campos de texto sería peor.
            <div key={zone.id} className="rounded-lg bg-secondary/30 p-3 space-y-2">
              <Input
                type="text"
                placeholder="Nombre de la zona"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveEditName(zone);
                  if (e.key === "Escape") cancelEditName();
                }}
              />
              <Input
                type="text"
                placeholder="Descripción (opcional)"
                value={descriptionInput}
                onChange={(e) => setDescriptionInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveEditName(zone);
                  if (e.key === "Escape") cancelEditName();
                }}
              />
              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-primary"
                  onClick={() => saveEditName(zone)}
                >
                  <Check className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={cancelEditName}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : (
          <div
            key={zone.id}
            className={cardRowClass(zone.is_active)}
          >
            {/* min-w-[140px] en vez de solo flex-1 min-w-0: sin un piso de
                ancho, esta columna competía por espacio contra 3 controles
                de ancho fijo (precio/select/switch) y en pantallas angostas
                terminaba comprimida a 0px -- el nombre de la zona
                literalmente desaparecía, dejando solo los controles
                (reportado real, con captura: "no se termina de entender lo
                de las zonas"). flex-wrap en el contenedor deja que los
                controles bajen a una segunda línea en vez de exprimir el
                nombre. Ahora es un <button>, no un <div>: clickear el
                nombre/descripción abre el mismo modo de edición vertical de
                arriba (antes solo el precio era editable). */}
            <button
              type="button"
              className="-mx-1 min-w-[140px] flex-1 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-secondary/50"
              onClick={() => startEditName(zone)}
            >
              <p className="font-medium truncate">{zone.name}</p>
              {zone.description && (
                <p className="text-caption text-muted-foreground truncate">
                  {zone.description}
                </p>
              )}
            </button>

            <div className="flex flex-wrap items-center gap-3">
              {editingZoneId === zone.id ? (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">$</span>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={feeInput}
                    onChange={(e) => setFeeInput(e.target.value)}
                    className="w-24"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveEditFee(zone);
                      if (e.key === "Escape") cancelEditFee();
                    }}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-primary"
                    onClick={() => saveEditFee(zone)}
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={cancelEditFee}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  className="font-bold text-primary"
                  onClick={() => startEditFee(zone)}
                >
                  {formatCurrency(zone.fee)}
                </Button>
              )}

              <Select
                value={zone.map_zone_key ?? NONE_VALUE}
                onValueChange={(value) => changeMapZoneKey(zone, value)}
              >
                <SelectTrigger size="sm" className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MAP_ZONE_KEY_OPTIONS.map((key, index) => (
                    <SelectItem key={key} value={key}>
                      Zona {index + 1}
                    </SelectItem>
                  ))}
                  <SelectItem value={NONE_VALUE}>Ninguna</SelectItem>
                </SelectContent>
              </Select>

              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => setEditingShapeZone(zone)}
                title="Editar forma en el mapa"
              >
                <Map className="h-4 w-4" />
              </Button>

              <Switch
                checked={zone.is_active}
                onCheckedChange={(checked) => toggleActive(zone, checked)}
                title={zone.is_active ? "Desactivar zona" : "Reactivar zona"}
              />
            </div>
          </div>
          ),
        )}

        {isAdding ? (
          <div className="rounded-lg bg-secondary/30 p-3 space-y-2">
            <Input
              type="text"
              placeholder="Nombre de la zona"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoFocus
            />
            <Input
              type="text"
              placeholder="Descripción (opcional)"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
            />
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">$</span>
              <Input
                type="text"
                inputMode="decimal"
                placeholder="Costo"
                value={newFee}
                onChange={(e) => setNewFee(e.target.value)}
                className="w-28"
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveAdd();
                  if (e.key === "Escape") cancelAdd();
                }}
              />
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-primary"
                onClick={saveAdd}
                disabled={createZone.isPending}
              >
                <Check className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={cancelAdd}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" className="w-full" onClick={startAdd}>
            <Plus className="mr-1.5 h-4 w-4" />
            Agregar zona
          </Button>
        )}
      </CardContent>

      {editingShapeZone && (
        <DeliveryZonePolygonEditorDialog
          zone={editingShapeZone}
          open={editingShapeZone !== null}
          onOpenChange={(open) => {
            if (!open) setEditingShapeZone(null);
          }}
        />
      )}
    </Card>
  );
}

function cardRowClass(isActive: boolean) {
  return [
    "flex flex-wrap items-center justify-between gap-3 rounded-lg bg-secondary/30 p-3",
    isActive ? "" : "opacity-50",
  ]
    .filter(Boolean)
    .join(" ");
}

"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { useSettings, useUpdateAppSettings } from "@/lib/hooks/use-app-settings";
import { formatCurrency } from "@/lib/utils/format";

type EditableField =
  | "default_delivery_fee"
  | "pedidosya_commission_pct"
  | "default_delivery_minutes";

export function PedidosCard() {
  const settings = useSettings();
  const updateSettings = useUpdateAppSettings();

  const [editingField, setEditingField] = useState<EditableField | null>(null);
  const [fieldInput, setFieldInput] = useState("");

  const startEdit = (field: EditableField, currentValue: string | number) => {
    setFieldInput(String(currentValue));
    setEditingField(field);
  };

  const cancelEdit = () => {
    setEditingField(null);
    setFieldInput("");
  };

  const saveDecimal = (
    field: "default_delivery_fee" | "pedidosya_commission_pct",
  ) => {
    const parsed = Number(fieldInput.trim().replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0) {
      toast.error("Ingresá un valor válido");
      return;
    }
    updateSettings.mutate({ [field]: parsed });
    setEditingField(null);
  };

  const saveInteger = (field: "default_delivery_minutes") => {
    const parsed = parseInt(fieldInput.trim(), 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
      toast.error("Ingresá un valor válido");
      return;
    }
    updateSettings.mutate({ [field]: parsed });
    setEditingField(null);
  };

  return (
    <Card className="bg-card">
      <CardHeader>
        <CardTitle>Pedidos</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between rounded-lg bg-secondary/30 p-3">
          <div>
            <p className="font-medium">Costo de delivery por defecto</p>
            <p className="text-caption text-muted-foreground">Se usa como valor inicial al crear un pedido con envío</p>
          </div>
          {editingField === "default_delivery_fee" ? (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">$</span>
              <Input
                type="text"
                inputMode="decimal"
                value={fieldInput}
                onChange={(e) => setFieldInput(e.target.value)}
                className="w-28"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveDecimal("default_delivery_fee");
                  if (e.key === "Escape") cancelEdit();
                }}
              />
              <Button size="icon" variant="ghost" className="h-8 w-8 text-primary" onClick={() => saveDecimal("default_delivery_fee")}>
                <Check className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={cancelEdit}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <Button variant="ghost" className="font-bold text-primary" onClick={() => startEdit("default_delivery_fee", settings.default_delivery_fee)}>
              {formatCurrency(settings.default_delivery_fee)}
            </Button>
          )}
        </div>

        <div className="flex items-center justify-between rounded-lg bg-secondary/30 p-3">
          <div>
            <p className="font-medium">Comisión de PedidosYa</p>
            <p className="text-caption text-muted-foreground">Se aplica sobre el total al crear un pedido marcado como PedidosYa</p>
            <p className="text-caption text-muted-foreground/70">Los pedidos ya creados conservan el % que tenían al crearse</p>
          </div>
          {editingField === "pedidosya_commission_pct" ? (
            <div className="flex items-center gap-2">
              <Input
                type="text"
                inputMode="decimal"
                value={fieldInput}
                onChange={(e) => setFieldInput(e.target.value)}
                className="w-20"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveDecimal("pedidosya_commission_pct");
                  if (e.key === "Escape") cancelEdit();
                }}
              />
              <span className="text-muted-foreground">%</span>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-primary" onClick={() => saveDecimal("pedidosya_commission_pct")}>
                <Check className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={cancelEdit}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              className="font-bold text-primary"
              onClick={() =>
                startEdit("pedidosya_commission_pct", settings.pedidosya_commission_pct)
              }
            >
              {settings.pedidosya_commission_pct}%
            </Button>
          )}
        </div>

        <div className="flex items-center justify-between rounded-lg bg-secondary/30 p-3">
          <div>
            <p className="font-medium">Minutos de entrega por defecto</p>
            <p className="text-caption text-muted-foreground">Tiempo que se suma a la hora actual al abrir un pedido nuevo con envío</p>
          </div>
          {editingField === "default_delivery_minutes" ? (
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={fieldInput}
                onChange={(e) => setFieldInput(e.target.value)}
                className="w-20"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveInteger("default_delivery_minutes");
                  if (e.key === "Escape") cancelEdit();
                }}
              />
              <Button size="icon" variant="ghost" className="h-8 w-8 text-primary" onClick={() => saveInteger("default_delivery_minutes")}>
                <Check className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={cancelEdit}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              className="font-bold text-primary"
              onClick={() =>
                startEdit("default_delivery_minutes", settings.default_delivery_minutes)
              }
            >
              {settings.default_delivery_minutes}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

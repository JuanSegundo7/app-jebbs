"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { useSettings, useUpdateAppSettings } from "@/lib/hooks/use-app-settings";

type EditableField = "business_name" | "pickup_address";

export function NegocioCard() {
  const settings = useSettings();
  const updateSettings = useUpdateAppSettings();

  const [editingField, setEditingField] = useState<EditableField | null>(null);
  const [fieldInput, setFieldInput] = useState("");

  const startEdit = (field: EditableField, currentValue: string) => {
    setFieldInput(currentValue);
    setEditingField(field);
  };

  const cancelEdit = () => {
    setEditingField(null);
    setFieldInput("");
  };

  const saveText = (field: EditableField) => {
    const value = fieldInput.trim();
    if (!value) {
      toast.error("Ingresá un valor válido");
      return;
    }
    updateSettings.mutate({ [field]: value });
    setEditingField(null);
  };

  return (
    <Card className="bg-card">
      <CardHeader>
        <CardTitle>Negocio</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between rounded-lg bg-secondary/30 p-3">
          <div>
            <p className="font-medium">Nombre del negocio</p>
          </div>
          {editingField === "business_name" ? (
            <div className="flex items-center gap-2">
              <Input
                type="text"
                value={fieldInput}
                onChange={(e) => setFieldInput(e.target.value)}
                className="w-56"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveText("business_name");
                  if (e.key === "Escape") cancelEdit();
                }}
              />
              <Button size="icon" variant="ghost" className="h-8 w-8 text-primary" onClick={() => saveText("business_name")}>
                <Check className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={cancelEdit}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <Button variant="ghost" className="font-bold text-primary" onClick={() => startEdit("business_name", settings.business_name)}>
              {settings.business_name}
            </Button>
          )}
        </div>

        <div className="flex items-center justify-between rounded-lg bg-secondary/30 p-3">
          <div>
            <p className="font-medium">Dirección de retiro</p>
            <p className="text-caption text-muted-foreground">Se usa en el mensaje para el repartidor</p>
          </div>
          {editingField === "pickup_address" ? (
            <div className="flex items-center gap-2">
              <Input
                type="text"
                value={fieldInput}
                onChange={(e) => setFieldInput(e.target.value)}
                className="w-56"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveText("pickup_address");
                  if (e.key === "Escape") cancelEdit();
                }}
              />
              <Button size="icon" variant="ghost" className="h-8 w-8 text-primary" onClick={() => saveText("pickup_address")}>
                <Check className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={cancelEdit}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <Button variant="ghost" className="font-bold text-primary" onClick={() => startEdit("pickup_address", settings.pickup_address)}>
              {settings.pickup_address}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

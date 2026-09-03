"use client";

import { useState, useEffect } from "react";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { useAllBurgers, useUpdateBurger } from "@/lib/hooks/use-menu-crud";
import { useAllExtras, useUpdateExtra } from "@/lib/hooks/use-menu-crud";
import { formatCurrency } from "@/lib/utils/format";
import type { ExtraCategory } from "@/lib/types";

const DEFAULT_DELIVERY_FEE_KEY = "jebbs_default_delivery_fee";
const PEDIDOSYA_COMMISSION_PCT_KEY = "jebbs_pedidosya_commission_pct";

const categoryLabels: Record<ExtraCategory, string> = {
  extra: "Extras",
  drink: "Bebidas",
  fries: "Papas",
  combo: "Combos",
};

export default function PricingPage() {
  const { data: burgers, isLoading: burgersLoading } = useAllBurgers();
  const { data: extras, isLoading: extrasLoading } = useAllExtras();
  const updateBurger = useUpdateBurger();
  const updateExtra = useUpdateExtra();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState("");

  const [defaultDeliveryFee, setDefaultDeliveryFee] = useState(2000);
  const [editingDeliveryFee, setEditingDeliveryFee] = useState(false);
  const [deliveryFeeInput, setDeliveryFeeInput] = useState("");

  const [pedidosYaCommissionPct, setPedidosYaCommissionPct] = useState(0);
  const [editingCommissionPct, setEditingCommissionPct] = useState(false);
  const [commissionPctInput, setCommissionPctInput] = useState("");

  useEffect(() => {
    const stored = localStorage.getItem(DEFAULT_DELIVERY_FEE_KEY);
    if (!stored) return;
    // Guard against a corrupted "NaN" string persisted before this fix (e.g.
    // from typing "2.500,50" when Number() didn't normalize the comma) —
    // fall back to the 2000 default instead of propagating NaN.
    const parsed = Number(stored);
    if (Number.isFinite(parsed)) setDefaultDeliveryFee(parsed);
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem(PEDIDOSYA_COMMISSION_PCT_KEY);
    if (!stored) return;
    const parsed = Number(stored);
    if (Number.isFinite(parsed)) setPedidosYaCommissionPct(parsed);
  }, []);

  const saveDeliveryFee = () => {
    const parsed = Number(deliveryFeeInput.trim().replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0) {
      toast.error("Ingresá un valor válido");
      return;
    }
    const value = Math.max(0, parsed);
    localStorage.setItem(DEFAULT_DELIVERY_FEE_KEY, String(value));
    setDefaultDeliveryFee(value);
    setEditingDeliveryFee(false);
  };

  const saveCommissionPct = () => {
    const parsed = Number(commissionPctInput.trim().replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      toast.error("Ingresá un porcentaje válido (0-100)");
      return;
    }
    const value = Math.min(100, Math.max(0, parsed));
    localStorage.setItem(PEDIDOSYA_COMMISSION_PCT_KEY, String(value));
    setPedidosYaCommissionPct(value);
    setEditingCommissionPct(false);
  };

  const handleStartEdit = (id: string, currentPrice: number) => {
    setEditingId(id);
    setEditPrice(currentPrice.toString());
  };

  const handleSaveBurgerPrice = async (id: string) => {
    await updateBurger.mutateAsync({
      id,
      base_price: Number.parseFloat(editPrice),
    });
    setEditingId(null);
    setEditPrice("");
  };

  const handleSaveExtraPrice = async (id: string) => {
    await updateExtra.mutateAsync({ id, price: Number.parseFloat(editPrice) });
    setEditingId(null);
    setEditPrice("");
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditPrice("");
  };

  const isLoading = burgersLoading || extrasLoading;

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <Header title="Precios" subtitle="Configuración central de precios" />

      <div className="flex-1 overflow-auto py-6 space-y-6">
        {/* Configuración general */}
        <Card className="bg-card">
          <CardHeader>
            <CardTitle>Configuración general</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between rounded-lg bg-secondary/30 p-3">
              <div>
                <p className="font-medium">Costo de delivery por defecto</p>
                <p className="text-xs text-muted-foreground">
                  Se usa como valor inicial al crear un pedido con envío
                </p>
              </div>

              {editingDeliveryFee ? (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">$</span>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={deliveryFeeInput}
                    onChange={(e) => setDeliveryFeeInput(e.target.value)}
                    className="w-28"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveDeliveryFee();
                      if (e.key === "Escape") setEditingDeliveryFee(false);
                    }}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-primary"
                    onClick={saveDeliveryFee}
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => setEditingDeliveryFee(false)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  className="font-bold text-primary"
                  onClick={() => {
                    setDeliveryFeeInput(defaultDeliveryFee.toString());
                    setEditingDeliveryFee(true);
                  }}
                >
                  {formatCurrency(defaultDeliveryFee)}
                </Button>
              )}
            </div>

            <div className="flex items-center justify-between rounded-lg bg-secondary/30 p-3">
              <div>
                <p className="font-medium">Comisión de PedidosYa</p>
                <p className="text-xs text-muted-foreground">
                  Se aplica sobre el total al crear un pedido marcado como PedidosYa
                </p>
              </div>

              {editingCommissionPct ? (
                <div className="flex items-center gap-2">
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={commissionPctInput}
                    onChange={(e) => setCommissionPctInput(e.target.value)}
                    className="w-20"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveCommissionPct();
                      if (e.key === "Escape") setEditingCommissionPct(false);
                    }}
                  />
                  <span className="text-muted-foreground">%</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-primary"
                    onClick={saveCommissionPct}
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => setEditingCommissionPct(false)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  className="font-bold text-primary"
                  onClick={() => {
                    setCommissionPctInput(pedidosYaCommissionPct.toString());
                    setEditingCommissionPct(true);
                  }}
                >
                  {pedidosYaCommissionPct}%
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="burgers">
          <TabsList className="mb-6">
            <TabsTrigger value="burgers">Hamburguesas</TabsTrigger>
            <TabsTrigger value="extras">Extras</TabsTrigger>
            <TabsTrigger value="drinks">Bebidas</TabsTrigger>
            <TabsTrigger value="fries">Papas</TabsTrigger>
            <TabsTrigger value="combos">Combos</TabsTrigger>
          </TabsList>

          <TabsContent value="burgers">
            <Card className="bg-card">
              <CardHeader>
                <CardTitle>Precios de Hamburguesas</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3, 4].map((i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {burgers?.map((burger) => (
                      <div
                        key={burger.id}
                        className="flex items-center justify-between rounded-lg bg-secondary/30 p-3"
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-medium">{burger.name}</span>
                          {!burger.is_available && (
                            <Badge variant="secondary" className="text-xs">
                              No disponible
                            </Badge>
                          )}
                        </div>

                        {editingId === burger.id ? (
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">$</span>
                            <Input
                              type="number"
                              value={editPrice}
                              onChange={(e) => setEditPrice(e.target.value)}
                              className="w-28"
                              autoFocus
                            />
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-primary"
                              onClick={() => handleSaveBurgerPrice(burger.id)}
                              disabled={updateBurger.isPending}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              onClick={handleCancel}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="ghost"
                            className="font-bold text-primary"
                            onClick={() =>
                              handleStartEdit(burger.id, burger.base_price)
                            }
                          >
                            {formatCurrency(burger.base_price)}
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {(["extras", "drinks", "fries", "combos"] as const).map((tab) => {
            const categoryMap: Record<string, ExtraCategory> = {
              extras: "extra",
              drinks: "drink",
              fries: "fries",
              combos: "combo",
            };
            const category = categoryMap[tab];
            const filteredExtras =
              extras?.filter((e) => e.category === category) || [];

            return (
              <TabsContent key={tab} value={tab}>
                <Card className="bg-card">
                  <CardHeader>
                    <CardTitle>Precios de {categoryLabels[category]}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {isLoading ? (
                      <div className="space-y-3">
                        {[1, 2, 3, 4].map((i) => (
                          <Skeleton key={i} className="h-12 w-full" />
                        ))}
                      </div>
                    ) : filteredExtras.length > 0 ? (
                      <div className="space-y-2">
                        {filteredExtras.map((extra) => (
                          <div
                            key={extra.id}
                            className="flex items-center justify-between rounded-lg bg-secondary/30 p-3 bg0"
                          >
                            <div className="flex items-center gap-3">
                              <span className="font-medium">{extra.name}</span>
                              {!extra.is_available && (
                                <Badge variant="secondary" className="text-xs">
                                  No disponible
                                </Badge>
                              )}
                            </div>

                            {editingId === extra.id ? (
                              <div className="flex items-center gap-2">
                                <span className="text-muted-foreground">$</span>
                                <Input
                                  type="number"
                                  value={editPrice}
                                  onChange={(e) => setEditPrice(e.target.value)}
                                  className="w-28"
                                  autoFocus
                                />
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-status-ready"
                                  onClick={() => handleSaveExtraPrice(extra.id)}
                                  disabled={updateExtra.isPending}
                                >
                                  <Check className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8"
                                  onClick={handleCancel}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ) : (
                              <Button
                                variant="ghost"
                                className="font-bold text-primary"
                                onClick={() =>
                                  handleStartEdit(extra.id, extra.price)
                                }
                              >
                                {formatCurrency(extra.price)}
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="py-8 text-center text-muted-foreground">
                        No hay items en esta categoría
                      </p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            );
          })}
        </Tabs>
      </div>
    </div>
  );
}

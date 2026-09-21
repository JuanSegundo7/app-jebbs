"use client";

import { useState } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Check, X } from "lucide-react";
import { useAllBurgers, useUpdateBurger } from "@/lib/hooks/use-menu-crud";
import { useAllExtras, useUpdateExtra } from "@/lib/hooks/use-menu-crud";
import { formatCurrency } from "@/lib/utils/format";
import type { ExtraCategory } from "@/lib/types";

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
      <Header title="Precios" subtitle="Precios de hamburguesas, extras y combos" />

      <div className="flex-1 overflow-auto py-6 space-y-6">
        <p className="text-caption text-muted-foreground px-1">
          El costo de envío y la comisión ahora se configuran en{" "}
          <Link href="/configuracion" className="underline hover:text-foreground">
            Configuración
          </Link>
          .
        </p>

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
                            <Badge variant="secondary" className="text-caption">
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
                                <Badge variant="secondary" className="text-caption">
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

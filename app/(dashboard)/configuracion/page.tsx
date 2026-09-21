"use client";

import { useEffect, useState } from "react";
import { useNextStep } from "nextstepjs";
import { SlidersHorizontal, MapPin, Palette, MessageSquare, Printer } from "lucide-react";
import { Header } from "@/components/layout/header";
import { HelpButton } from "@/components/onboarding/help-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSettings, useUpdateAppSettings } from "@/lib/hooks/use-app-settings";
import { NegocioCard } from "@/components/configuracion/negocio-card";
import { PedidosCard } from "@/components/configuracion/pedidos-card";
import { AparienciaCard } from "@/components/configuracion/apariencia-card";
import { EnviosTab } from "@/components/configuracion/envios-tab";
import { ImpresoraTab } from "@/components/configuracion/impresora-tab";
import { TemplateEditor } from "@/components/configuracion/template-editor";
import { SAMPLE_ORDER } from "@/lib/settings/sample-order";
import { formatOrderForWhatsapp } from "@/lib/utils/formatOrderWhatsapp";
import { formatOrderForDelivery } from "@/lib/utils/formatOrderDelivery";
import { DEFAULT_APP_SETTINGS } from "@/lib/settings/defaults";

type ConfiguracionTab = "general" | "envios" | "apariencia" | "mensajes" | "impresora";

export default function ConfiguracionPage() {
  const settings = useSettings();
  const updateSettings = useUpdateAppSettings();
  const [tab, setTab] = useState<ConfiguracionTab>("general");

  // Los 4 pasos del tour "configuracion" (components/onboarding/tours.tsx)
  // apuntan a ids que emite TemplateEditor, montado solo dentro de la
  // pestaña "Mensajes". Radix desmonta el TabsContent inactivo -- si el
  // tour arranca en otra pestaña, el primer querySelector del tour falla.
  // Mismo patrón que ya usa finanzas/page.tsx para el mismo problema.
  const { currentTour } = useNextStep();
  useEffect(() => {
    if (currentTour === "configuracion") setTab("mensajes");
  }, [currentTour]);

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <Header
        title="Configuración"
        subtitle="Datos del negocio y mensajes"
        extraActions={<HelpButton tour="configuracion" />}
      />

      <div className="flex-1 overflow-auto py-6">
        <Tabs value={tab} onValueChange={(v) => setTab(v as ConfiguracionTab)}>
          <div className="overflow-x-auto pb-1">
            <TabsList id="configuracion-tabs-list" className="rounded-full p-1">
              <TabsTrigger value="general" className="rounded-full px-6 text-subheadline gap-1.5">
                <SlidersHorizontal className="h-4 w-4" /> General
              </TabsTrigger>
              <TabsTrigger value="envios" className="rounded-full px-6 text-subheadline gap-1.5">
                <MapPin className="h-4 w-4" /> Envíos
              </TabsTrigger>
              <TabsTrigger value="apariencia" className="rounded-full px-6 text-subheadline gap-1.5">
                <Palette className="h-4 w-4" /> Apariencia
              </TabsTrigger>
              <TabsTrigger value="mensajes" className="rounded-full px-6 text-subheadline gap-1.5">
                <MessageSquare className="h-4 w-4" /> Mensajes
              </TabsTrigger>
              <TabsTrigger value="impresora" className="rounded-full px-6 text-subheadline gap-1.5">
                <Printer className="h-4 w-4" /> Impresora
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="general" className="mt-6 space-y-6">
            <NegocioCard />
            <PedidosCard />
          </TabsContent>

          <TabsContent value="envios" className="mt-6">
            <EnviosTab />
          </TabsContent>

          <TabsContent value="apariencia" className="mt-6">
            <AparienciaCard />
          </TabsContent>

          {/* forceMount: TemplateEditor guarda un `draft` local sin guardar
              (template-editor.tsx L37-42) que protege contra que un refetch
              en background pise una plantilla a medio escribir. Sin
              forceMount, Radix desmonta este panel al cambiar de pestaña y
              ese draft se pierde en silencio -- riesgo real (plantillas
              largas) que no existía antes de meter tabs. Solo acá: Envíos
              tiene su propio estado descartable (formulario corto), y forzar
              el montaje de EnviosTab rompería la medición de ancho del mapa
              SVG si se monta oculto. */}
          <TabsContent
            value="mensajes"
            forceMount
            className="mt-6 space-y-6 data-[state=inactive]:hidden"
          >
            <Card className="bg-card">
              <CardHeader>
                <CardTitle>Mensaje de WhatsApp</CardTitle>
              </CardHeader>
              <CardContent>
                <TemplateEditor
                  label="whatsapp"
                  value={settings.whatsapp_template}
                  defaultTemplate={DEFAULT_APP_SETTINGS.whatsapp_template}
                  rows={20}
                  requiredVars={["items", "total"]}
                  renderPreview={(draft) =>
                    formatOrderForWhatsapp(SAMPLE_ORDER, { ...settings, whatsapp_template: draft })
                  }
                  onSave={(next) => updateSettings.mutate({ whatsapp_template: next })}
                  isSaving={updateSettings.isPending}
                />
              </CardContent>
            </Card>

            <Card className="bg-card">
              <CardHeader>
                <CardTitle>Mensaje para el repartidor</CardTitle>
              </CardHeader>
              <CardContent>
                <TemplateEditor
                  label="delivery"
                  value={settings.delivery_template}
                  defaultTemplate={DEFAULT_APP_SETTINGS.delivery_template}
                  rows={10}
                  renderPreview={(draft) =>
                    formatOrderForDelivery(SAMPLE_ORDER, { ...settings, delivery_template: draft })
                  }
                  onSave={(next) => updateSettings.mutate({ delivery_template: next })}
                  isSaving={updateSettings.isPending}
                />
              </CardContent>
            </Card>

            <p className="text-caption text-muted-foreground px-1">
              El ticket de cocina lo imprime el servicio local (localhost:3001) y no se configura desde acá.
            </p>
          </TabsContent>

          <TabsContent value="impresora" className="mt-6">
            <ImpresoraTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

import type React from "react";
import { QueryProvider } from "@/components/providers/query-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { ThemeColorProvider } from "@/components/providers/theme-color-provider";
import { MotionProvider } from "@/components/providers/motion-provider";

import { Analytics } from "@vercel/analytics/next";
import { SidebarLayout } from "@/components/layout/sidebar-layout";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Toaster } from "sonner";
import { NextStep, NextStepProvider } from "nextstepjs";
import { TourCard } from "@/components/onboarding/tour-card";
import { tours } from "@/components/onboarding/tours";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider>
      <QueryProvider>
        {/* ThemeColorProvider necesita un QueryClientProvider ancestro
            (useSettings() hace una query) -- por eso vive DENTRO de
            QueryProvider, no afuera junto a ThemeProvider. No depende de
            useTheme(): lee la clase "dark" directo del <html>, ver el
            comentario en theme-color-provider.tsx. */}
        <ThemeColorProvider>
        {/* MotionProvider envuelve solo el arbol que puede tener motion.*
            (sidebar, kanban) -- Toaster/Analytics quedan afuera a proposito,
            mismo criterio que ya separa a Toaster de SidebarProvider abajo. */}
        <MotionProvider>
          {/* NextStepProvider/NextStep wrap SidebarProvider from the OUTSIDE,
              not the other way around: nextstepjs renders its own
              position:relative wrapper div around whatever it's given, and
              SidebarProvider needs its own direct child (SidebarLayout) to
              stay unwrapped so the sidebar's flex-sibling push layout keeps
              working. Nesting it the other way traps the sidebar+content
              pair inside that extra block-level div, which silently turns
              the "push content" behavior into "overlay". */}
          <NextStepProvider>
            <NextStep steps={tours} cardComponent={TourCard}>
              <SidebarProvider defaultOpen={false}>
                <SidebarLayout>{children}</SidebarLayout>
              </SidebarProvider>
            </NextStep>
          </NextStepProvider>
        </MotionProvider>
        </ThemeColorProvider>
        {/* Taxonomia de toast (regla de la casa):
            - toast.error   = lo pedido NO paso.
            - toast.warning = paso, pero un efecto secundario fallo -- puede
              requerir accion (ej: se guardo el gasto pero no se ajusto el
              stock).
            - toast.info    = paso; contexto que no se pidio.
            No usar error para una falla parcial, ni warning para una falla
            total -- son distinguibles a proposito. */}
        {/* Toaster afuera de SidebarProvider a propósito: sonner no está
            aplicando su propio position:fixed en este árbol (bug de sonner
            o de cómo se monta acá, no investigado a fondo), y mientras esa
            sección quedaba adentro del flex de sidebar-wrapper, contaba
            como un tercer hijo en fila y estiraba TODO el layout más allá
            del viewport — scroll doble en cada página. Afuera del
            SidebarProvider, aunque el position:fixed siga sin aplicar,
            ya no puede volver a inflar ese contenedor. */}
        <Toaster
          richColors
          position="top-right"
          theme="dark"
          toastOptions={{
            classNames: {
              toast: "material-thick !text-foreground",
            },
          }}
        />
        <Analytics />
      </QueryProvider>
    </ThemeProvider>
  );
}

import type React from "react";
import { QueryProvider } from "@/components/providers/query-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";

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
        {/* NextStepProvider/NextStep wrap SidebarProvider from the OUTSIDE,
            not the other way around: nextstepjs renders its own
            position:relative wrapper div around whatever it's given, and
            SidebarProvider needs its own direct children (SidebarLayout,
            Toaster) to stay unwrapped so the sidebar's flex-sibling push
            layout keeps working. Nesting it the other way traps the
            sidebar+content pair inside that extra block-level div, which
            silently turns the "push content" behavior into "overlay". */}
        <NextStepProvider>
          <NextStep steps={tours} cardComponent={TourCard}>
            <SidebarProvider defaultOpen={false}>
              <SidebarLayout>{children}</SidebarLayout>
              <Toaster richColors position="top-right" />
            </SidebarProvider>
          </NextStep>
        </NextStepProvider>
        <Analytics />
      </QueryProvider>
    </ThemeProvider>
  );
}

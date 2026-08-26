import { redirect } from "next/navigation";

// /gastos and /costos merged into /finanzas (tabs: Resumen, Gastos, Insumos,
// Recetas) — kept as a redirect so old links and the onboarding flow don't
// break. See app/(dashboard)/finanzas/page.tsx.
export default function CostosPage() {
  redirect("/finanzas?tab=insumos");
}

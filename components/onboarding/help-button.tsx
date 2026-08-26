"use client";

import { useNextStep } from "nextstepjs";
import { Button } from "@/components/ui/button";
import { HelpCircle } from "lucide-react";

export function HelpButton({ tour }: { tour: string }) {
  const { startNextStep } = useNextStep();
  return (
    <Button variant="outline" size="icon" onClick={() => startNextStep(tour)} aria-label="Ayuda">
      <HelpCircle className="h-4 w-4" />
    </Button>
  );
}

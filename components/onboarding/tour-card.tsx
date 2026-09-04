"use client";

import type { CardComponentProps } from "nextstepjs";
import { Button } from "@/components/ui/button";

// Custom card rendered by NextStep for every tour step. NextStep positions
// and animates the wrapper itself (see nextstepjs's NextStepReact — the
// `nextstep-card` wrapper is already `position: absolute`), so this
// component only owns the visual chrome: it does not need its own
// positioning styles, and `arrow` is a ready-to-render element supplied by
// the library (already styled/positioned relative to that wrapper).
export function TourCard({
  step,
  currentStep,
  totalSteps,
  nextStep,
  prevStep,
  skipTour,
  arrow,
}: CardComponentProps) {
  const isLastStep = currentStep === totalSteps - 1;

  return (
    <div className="ios-glass rounded-2xl p-4 max-w-sm shadow-lg bg-card">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          {step.icon && <span aria-hidden="true">{step.icon}</span>}
          <h2 className="text-subheadline font-semibold">{step.title}</h2>
        </div>
        <span className="shrink-0 text-caption text-muted-foreground tabular-nums">
          {currentStep + 1} / {totalSteps}
        </span>
      </div>

      <div className="mb-4 text-subheadline text-muted-foreground leading-relaxed">{step.content}</div>

      <div className="flex items-center justify-between gap-2">
        {skipTour ? (
          <Button variant="ghost" size="sm" onClick={skipTour}>
            Saltar
          </Button>
        ) : (
          <span />
        )}

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={prevStep} disabled={currentStep === 0}>
            Anterior
          </Button>
          <Button size="sm" onClick={nextStep}>
            {isLastStep ? "Listo" : "Siguiente"}
          </Button>
        </div>
      </div>

      {arrow}
    </div>
  );
}

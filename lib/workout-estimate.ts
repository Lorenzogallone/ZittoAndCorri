// Stime di durata, distanza e intensità delle fasi di una seduta, per il
// grafico a blocchi e i riepiloghi. Funzioni pure.

import type { WorkoutStepInput, WorkoutType } from "@/lib/types";
import { stepVariant } from "./workout-guide.ts";

/** Passo di ripiego (s/km) quando la fase non ha un target. */
const DEFAULT_PACE: Record<WorkoutStepInput["kind"], number> = {
  warmup: 390,
  work: 300,
  recovery: 450,
  steady: 360,
  cooldown: 390,
};

/** Passo di ripiego per le varianti: sprint, recupero corricchiando o camminando. */
const VARIANT_PACE = { sprint: 210, jog: 450, walk: 660 } as const;

function stepPace(step: WorkoutStepInput): number {
  const { pace_min_s_km: min, pace_max_s_km: max } = step;
  if (min != null && max != null) return (min + max) / 2;
  const variant = stepVariant(step);
  return min ?? max ?? (variant ? VARIANT_PACE[variant] : DEFAULT_PACE[step.kind]);
}

export function estimateStep(step: WorkoutStepInput): { seconds: number; meters: number } {
  const pace = stepPace(step);
  const value = step.completion_value ?? 0;
  if (step.completion_type === "distance" && value > 0) {
    return { seconds: (value / 1000) * pace, meters: value };
  }
  const seconds = step.completion_type === "time" && value > 0 ? value : 300;
  return { seconds, meters: (seconds / pace) * 1000 };
}

export function estimateWorkout(steps: WorkoutStepInput[]): { seconds: number; meters: number } {
  return steps.reduce(
    (total, step) => {
      const estimate = estimateStep(step);
      return { seconds: total.seconds + estimate.seconds, meters: total.meters + estimate.meters };
    },
    { seconds: 0, meters: 0 },
  );
}

/** Intensità 1-4 di una fase, per l'altezza dei blocchi nel grafico. */
export function stepIntensity(step: WorkoutStepInput, type?: WorkoutType | null): number {
  const variant = stepVariant(step);
  if (variant === "sprint") return 4;
  if (variant === "walk") return 0.5;
  switch (step.kind) {
    case "work":
      return 4;
    case "recovery":
      return 1;
    case "warmup":
    case "cooldown":
      return 1.5;
    case "steady":
      if (type === "tempo" || type === "race") return 3;
      if (type === "recovery") return 1.5;
      return 2;
  }
}

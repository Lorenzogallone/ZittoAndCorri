// Distanza prevista di una seduta: esplicita, da durata e passo, oppure stimata
// dalle fasi guidate. Funzione pura.

import type { WorkoutStepInput } from "@/lib/types";
import { estimateWorkout } from "../workout-estimate.ts";

export function plannedMeters(workout: {
  type: string;
  target_distance_m?: number | null;
  target_duration_s?: number | null;
  target_pace_s_km?: number | null;
  workout_steps?: WorkoutStepInput[] | null;
}): number {
  if (workout.type === "cross") return 0;
  if (workout.target_distance_m) return workout.target_distance_m;
  if (workout.target_duration_s && workout.target_pace_s_km) {
    return Math.round((workout.target_duration_s / workout.target_pace_s_km) * 1000);
  }
  if (workout.workout_steps?.length) return Math.round(estimateWorkout(workout.workout_steps).meters);
  return 0;
}

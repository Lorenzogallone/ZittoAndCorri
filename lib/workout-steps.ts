import { z } from "zod";
import type {
  WorkoutStep,
  WorkoutStepCompletion,
  WorkoutStepInput,
  WorkoutStepKind,
} from "@/lib/types";

export const WORKOUT_STEP_KINDS = ["warmup", "work", "recovery", "steady", "cooldown"] as const;
export const WORKOUT_STEP_COMPLETIONS = ["time", "distance", "manual"] as const;

export const WorkoutStepInputSchema = z.object({
  kind: z.enum(WORKOUT_STEP_KINDS),
  label: z.string().trim().min(1).max(48),
  completion_type: z.enum(WORKOUT_STEP_COMPLETIONS),
  completion_value: z.number().int().positive().nullable(),
  pace_min_s_km: z.number().int().min(120).max(1_200).nullable(),
  pace_max_s_km: z.number().int().min(120).max(1_200).nullable(),
  hr_min_bpm: z.number().int().min(80).max(220).nullable(),
  hr_max_bpm: z.number().int().min(80).max(220).nullable(),
}).superRefine((step, ctx) => {
  if (step.completion_type === "manual" && step.completion_value != null) {
    ctx.addIssue({ code: "custom", path: ["completion_value"], message: "Una fase manuale non ha una durata o distanza automatica." });
  }
  if (step.completion_type !== "manual" && step.completion_value == null) {
    ctx.addIssue({ code: "custom", path: ["completion_value"], message: "La fase richiede un valore di completamento." });
  }
  if (step.pace_min_s_km != null && step.pace_max_s_km != null && step.pace_min_s_km > step.pace_max_s_km) {
    ctx.addIssue({ code: "custom", path: ["pace_min_s_km"], message: "Il range passo non è ordinato." });
  }
  if (step.hr_min_bpm != null && step.hr_max_bpm != null && step.hr_min_bpm > step.hr_max_bpm) {
    ctx.addIssue({ code: "custom", path: ["hr_min_bpm"], message: "Il range cardiaco non è ordinato." });
  }
});

export const WorkoutStepsInputSchema = z.array(WorkoutStepInputSchema).min(1).max(40);

export const WorkoutStepSchema = WorkoutStepInputSchema.and(z.object({
  id: z.string().trim().min(1).max(64),
  order: z.number().int().min(0).max(39),
}));

export const WorkoutStepsSchema = z.array(WorkoutStepSchema).min(1).max(40);

function integer(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : null;
}

/** Valida l'output AI e assegna identificatori/ordine deterministici. */
export function normalizeWorkoutSteps(value: unknown): WorkoutStep[] {
  const parsed = WorkoutStepsInputSchema.safeParse(value);
  if (!parsed.success) return [];
  return parsed.data.map((step, order) => ({ ...step, id: `step-${order + 1}`, order }));
}

/** Crea una guida minima per workout manuali o creati prima dello schema V1. */
export function legacyWorkoutStep(workout: {
  type?: string | null;
  target_distance_m?: number | null;
  target_duration_s?: number | null;
  target_pace_s_km?: number | null;
  target_hr_bpm?: number | null;
}): WorkoutStep[] {
  const distance = integer(workout.target_distance_m);
  const duration = integer(workout.target_duration_s);
  const pace = integer(workout.target_pace_s_km);
  const hr = integer(workout.target_hr_bpm);
  const completionType: WorkoutStepCompletion = distance ? "distance" : duration ? "time" : "manual";
  const completionValue = distance ?? duration;
  const label = workout.type === "interval" ? "Allenamento" : "Corsa";
  return [{
    id: "step-1",
    order: 0,
    kind: "steady" satisfies WorkoutStepKind,
    label,
    completion_type: completionType,
    completion_value: completionValue,
    pace_min_s_km: pace == null ? null : Math.max(120, pace - 10),
    pace_max_s_km: pace == null ? null : Math.min(1_200, pace + 10),
    hr_min_bpm: null,
    hr_max_bpm: hr != null && hr >= 80 && hr <= 220 ? hr : null,
  }];
}

export function workoutStepsOrLegacy(value: unknown, workout: Parameters<typeof legacyWorkoutStep>[0]): WorkoutStep[] {
  const parsed = WorkoutStepsSchema.safeParse(value);
  return parsed.success ? parsed.data.slice().sort((a, b) => a.order - b.order) : legacyWorkoutStep(workout);
}

export type { WorkoutStep, WorkoutStepInput };

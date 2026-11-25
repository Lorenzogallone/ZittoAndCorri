// "Non mi sento al 100%": lightens the next days' sessions in a
// deterministic, reversible way (original values stay in adapted_from).
// Pure functions.

import type { Translator } from "../../i18n/config.ts";
import type { WorkoutStep, WorkoutStepInput, WorkoutType } from "@/lib/types";
import { groupWorkoutSteps } from "../workout-guide.ts";
import { estimateWorkout } from "../workout-estimate.ts";

export type AdaptReason = "tired" | "sick" | "busy";

export const ADAPT_REASON_KEYS: readonly AdaptReason[] = ["tired", "busy", "sick"];

export const ADAPT_DURATIONS = [{ days: 3 }, { days: 7 }, { days: 14 }] as const;

/** Label and explanation of a reason (`t` bound to the "labels" namespace). */
export function adaptReasonText(t: Translator, reason: AdaptReason): { label: string; hint: string } {
  return { label: t(`adapt.reason.${reason}.label`), hint: t(`adapt.reason.${reason}.hint`) };
}

/** "3 giorni", "1 settimana", "2 settimane". */
export function adaptDurationLabel(t: Translator, days: (typeof ADAPT_DURATIONS)[number]["days"]): string {
  return t(`adapt.duration.d${days}`);
}

export interface AdaptableWorkout {
  type: WorkoutType;
  status: string;
  target_distance_m: number | null;
  target_duration_s: number | null;
  target_pace_s_km: number | null;
  target_hr_bpm: number | null;
  workout_steps: WorkoutStep[];
  description: string | null;
  focus: string | null;
}

export type AdaptedFields = Partial<AdaptableWorkout>;

const QUALITY: WorkoutType[] = ["interval", "tempo", "race"];

function roundTo(value: number, step: number): number {
  return Math.max(step, Math.round(value / step) * step);
}

function scale(value: number | null, factor: number, step: number): number | null {
  return value == null ? null : roundTo(value * factor, step);
}

function withIds(steps: WorkoutStepInput[]): WorkoutStep[] {
  return steps.map((step, order) => ({ ...step, id: `step-${order + 1}`, order }));
}

function scaleStep(step: WorkoutStepInput, factor: number): WorkoutStepInput {
  if (step.completion_value == null || step.completion_type === "manual") return step;
  const unit = step.completion_type === "distance" ? 100 : 30;
  return { ...step, completion_value: roundTo(step.completion_value * factor, unit) };
}

/** Shortens: fewer repetitions and shorter continuous phases, same structure. */
function shortenSteps(steps: WorkoutStep[], factor: number): WorkoutStep[] {
  const out: WorkoutStepInput[] = [];
  for (const block of groupWorkoutSteps(steps)) {
    if (block.kind === "single") {
      out.push(scaleStep(block.step, block.step.kind === "work" ? 1 : factor));
    } else {
      const times = Math.max(1, Math.round(block.times * factor));
      for (let i = 0; i < times; i++) {
        const last = i === times - 1;
        for (const step of block.steps) {
          if (last && step.kind === "recovery" && block.steps.at(-1) === step) continue;
          out.push(step);
        }
      }
    }
  }
  return withIds(out);
}

/** A single easy continuous phase, by feel. */
function easySteps(workout: AdaptableWorkout, factor: number): WorkoutStep[] {
  const estimate = estimateWorkout(workout.workout_steps);
  const seconds = workout.target_duration_s ?? Math.round(estimate.seconds);
  return withIds([{
    kind: "steady",
    label: "Facile, ritmo da chiacchierata",
    completion_type: "time",
    completion_value: roundTo(Math.max(15 * 60, seconds * factor), 60),
    pace_min_s_km: null,
    pace_max_s_km: null,
    hr_min_bpm: null,
    hr_max_bpm: workout.target_hr_bpm,
  }]);
}

/** Updated session fields, or null if it should be left alone. */
export function adaptWorkout(workout: AdaptableWorkout, reason: AdaptReason): AdaptedFields | null {
  if (workout.status !== "planned") return null;
  if (reason === "sick") return { status: "skipped" };
  if (workout.type === "cross") return null;

  if (reason === "busy") {
    const factor = 0.6;
    return {
      target_distance_m: scale(workout.target_distance_m, factor, 500),
      target_duration_s: scale(workout.target_duration_s, factor, 60),
      workout_steps: shortenSteps(workout.workout_steps, factor),
    };
  }

  const quality = QUALITY.includes(workout.type);
  const factor = quality ? 0.7 : workout.type === "long" ? 0.75 : 0.8;
  return {
    type: quality ? "easy" : workout.type,
    target_distance_m: scale(workout.target_distance_m, factor, 500),
    target_duration_s: scale(workout.target_duration_s, factor, 60),
    target_pace_s_km: null,
    workout_steps: easySteps(workout, factor),
    description: "Seduta alleggerita: corri piano e a sensazione, senza guardare il passo. Se ti senti meglio del previsto, resta comunque facile.",
    focus: null,
  };
}

/** Original values to store so the change can be undone. */
export function originalFields(workout: AdaptableWorkout, changed: AdaptedFields): AdaptedFields {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(changed) as Array<keyof AdaptableWorkout>) {
    out[key] = workout[key];
  }
  return out as AdaptedFields;
}

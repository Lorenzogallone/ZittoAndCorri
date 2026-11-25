// Turns a session's workout_steps into readable instructions: groups
// repetitions ("6 × 400 m + 90\" recovery") and explains each phase in words.
import { DEFAULT_LOCALE, type Locale, type Translator } from "../i18n/config.ts";
import type { WorkoutStepInput, WorkoutStepVariant, WorkoutType } from "@/lib/types";

// Labels are in the "labels" namespace: `t` is the translator already bound to
// that namespace. Functions that format numbers take the language
// (Italian if omitted, for texts that end up in prompts, database or Intervals.icu).

export type StepBlock<S extends WorkoutStepInput = WorkoutStepInput> =
  | { kind: "single"; step: S }
  | { kind: "repeat"; times: number; steps: S[] };

/** Valid variant for the phase type: sprint on fast segments, jog/walk on recoveries. */
export function stepVariant(step: Pick<WorkoutStepInput, "kind" | "variant">): WorkoutStepVariant | null {
  if (step.kind === "work" && step.variant === "sprint") return "sprint";
  if (step.kind === "recovery" && (step.variant === "jog" || step.variant === "walk")) return step.variant;
  return null;
}

/** Phase name for the UI: "Sprint", "Recovery walking"… */
export function stepKindLabel(t: Translator, step: Pick<WorkoutStepInput, "kind" | "variant">): string {
  const variant = stepVariant(step);
  return variant ? t(`stepVariant.${variant}`) : t(`stepKind.${step.kind}`);
}

/** Short explanation, for those unfamiliar with the jargon, of each session type. */
export const workoutTypeGuide = (t: Translator, type: WorkoutType): string => t(`typeGuide.${type}`);

function sameStep(a: WorkoutStepInput, b: WorkoutStepInput): boolean {
  return a.kind === b.kind &&
    stepVariant(a) === stepVariant(b) &&
    a.completion_type === b.completion_type &&
    a.completion_value === b.completion_value &&
    a.pace_min_s_km === b.pace_min_s_km &&
    a.pace_max_s_km === b.pace_max_s_km &&
    a.hr_min_bpm === b.hr_min_bpm &&
    a.hr_max_bpm === b.hr_max_bpm;
}

function matchesAt<S extends WorkoutStepInput>(steps: S[], at: number, pattern: S[], length = pattern.length): boolean {
  if (at + length > steps.length) return false;
  for (let i = 0; i < length; i += 1) {
    if (!sameStep(steps[at + i], pattern[i])) return false;
  }
  return true;
}

/**
 * Groups consecutive repeated sequences (e.g. work+recovery × 6). The last
 * repetition may omit the final recovery, as almost always happens.
 */
export function groupWorkoutSteps<S extends WorkoutStepInput>(steps: S[]): StepBlock<S>[] {
  const blocks: StepBlock<S>[] = [];
  let i = 0;
  while (i < steps.length) {
    let best: { length: number; times: number; covered: number } | null = null;
    for (let length = 1; length <= 8; length += 1) {
      const pattern = steps.slice(i, i + length);
      if (pattern.length < length || !pattern.some((step) => step.kind === "work")) continue;
      let times = 1;
      while (matchesAt(steps, i + times * length, pattern)) times += 1;
      let covered = times * length;
      const trailing = pattern[length - 1];
      if (length > 1 && trailing.kind === "recovery" && matchesAt(steps, i + covered, pattern, length - 1)) {
        times += 1;
        covered += length - 1;
      }
      if (times >= 2 && (!best || covered > best.covered)) best = { length, times, covered };
    }
    if (best) {
      blocks.push({ kind: "repeat", times: best.times, steps: steps.slice(i, i + best.length) });
      i += best.covered;
    } else {
      blocks.push({ kind: "single", step: steps[i] });
      i += 1;
    }
  }
  return blocks;
}

function clock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.round(totalSeconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Duration or distance of a phase in readable form: 400 m, 2 km, 10', 90". */
export function formatStepAmount(step: WorkoutStepInput, locale: Locale = DEFAULT_LOCALE): string | null {
  const value = step.completion_value;
  if (step.completion_type === "manual" || value == null) return null;
  if (step.completion_type === "distance") {
    if (value >= 1000) {
      const km = value / 1000;
      return `${km.toFixed(2).replace(/\.?0+$/, "").replace(".", locale === "it" ? "," : ".")} km`;
    }
    return `${value} m`;
  }
  if (value < 120 && value % 60 !== 0) return `${value}"`;
  if (value % 60 === 0) return `${value / 60}'`;
  return `${Math.floor(value / 60)}'${String(value % 60).padStart(2, "0")}"`;
}

export function formatStepPace(t: Translator, step: WorkoutStepInput): string | null {
  const { pace_min_s_km: min, pace_max_s_km: max } = step;
  if (min != null && max != null) return min === max ? `${clock(min)}/km` : `${clock(min)}–${clock(max)}/km`;
  if (min != null) return t("step.slowerThan", { pace: `${clock(min)}/km` });
  if (max != null) return t("step.notFasterThan", { pace: `${clock(max)}/km` });
  return null;
}

export function formatStepHr(step: WorkoutStepInput): string | null {
  const { hr_min_bpm: min, hr_max_bpm: max } = step;
  if (min != null && max != null) return `${min}–${max} bpm`;
  if (max != null) return `≤ ${max} bpm`;
  if (min != null) return `≥ ${min} bpm`;
  return null;
}

/** Full sentence for a single phase, e.g. "400 m at 4:20–4:30/km". */
export function describeStep(t: Translator, step: WorkoutStepInput, locale: Locale = DEFAULT_LOCALE): string {
  const amount = formatStepAmount(step, locale);
  const pace = formatStepPace(t, step);
  const hr = formatStepHr(step);
  const variant = stepVariant(step);
  const parts = [amount ?? t("step.byFeel")];
  if (variant === "walk") parts.push(t("step.walking"));
  if (variant === "jog") parts.push(t("step.jogging"));
  if (pace) parts.push(t("step.atPace", { pace }));
  else if (variant === "sprint") parts.push(t("step.allOut"));
  if (hr) parts.push(t("step.heartRate", { hr }));
  return parts.join(" ");
}

/** Concise session title, e.g. "6 × 400 m" or "3 × 8'". */
export function workoutHeadline(steps: WorkoutStepInput[], locale: Locale = DEFAULT_LOCALE): string | null {
  const repeat = groupWorkoutSteps(steps).find((block) => block.kind === "repeat");
  if (!repeat || repeat.kind !== "repeat") return null;
  const work = repeat.steps
    .filter((step) => step.kind === "work")
    .map((step) => formatStepAmount(step, locale) ?? step.label);
  if (!work.length) return null;
  return `${repeat.times} × ${work.length > 1 ? `(${work.join(" + ")})` : work[0]}`;
}

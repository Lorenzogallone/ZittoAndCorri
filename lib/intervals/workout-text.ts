// Fasi guidate → testo "workout builder" di Intervals.icu. Funzioni pure.
//
// Sintassi (forum.intervals.icu, "Workout builder syntax quick guide"):
// - ogni fase è una riga "- <cue> <durata> <target>";
// - durata "10m", "90s", "1m30", "1km", "400mtr";
// - passo assoluto "5:00-4:40/km Pace", FC in percentuale "70-80% HR";
// - un solo target per fase; ripetute con una riga "6x" (niente annidamenti);
// - sezioni "Warmup", "Main Set", "Cooldown"; "Main Set 6x" ripete tutto il blocco.
// I bpm assoluti non sono documentati: la FC viaggia in % della FC massima.

import type { WorkoutStepInput, WorkoutStepKind } from "@/lib/types";

export type IntervalsTargetPreference = "auto" | "pace" | "hr";

export interface IntervalsTargetContext {
  /** FC massima effettiva dell'atleta (Zepp o profilo); senza, niente target FC. */
  max_hr: number | null;
  preference: IntervalsTargetPreference;
}

export interface IntervalsWorkoutSource {
  id: string;
  date: string;
  title: string;
  target_distance_m: number | null;
  target_duration_s: number | null;
  steps: WorkoutStepInput[];
}

export interface IntervalsWorkoutDraft {
  category: "WORKOUT";
  type: "Run";
  start_date_local: string;
  name: string;
  description: string;
  external_id: string;
}

const EXTERNAL_PREFIX = "zc:";
/** Fase manuale senza valore: Intervals vuole comunque una durata. */
const MANUAL_FALLBACK_SECONDS = 20 * 60;

export function intervalsExternalId(workoutId: string): string {
  return `${EXTERNAL_PREFIX}${workoutId}`;
}

export function isZittoExternalId(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(EXTERNAL_PREFIX);
}

function cueFor(step: WorkoutStepInput): string {
  if (step.kind === "work" && step.variant === "sprint") return "Sprint";
  if (step.kind === "recovery" && step.variant === "walk") return "Cammina";
  return {
    warmup: "Riscaldamento",
    work: "Ripetuta",
    recovery: "Recupero",
    steady: "Corsa",
    cooldown: "Defaticamento",
  }[step.kind];
}

export function formatIntervalsDuration(step: WorkoutStepInput): string {
  const value = step.completion_value;
  if (step.completion_type === "distance" && value != null && value > 0) {
    if (value % 1000 === 0) return `${value / 1000}km`;
    if (value % 100 === 0 && value > 1000) return `${(value / 1000).toFixed(1)}km`;
    return `${Math.round(value)}mtr`;
  }
  const seconds = step.completion_type === "time" && value != null && value > 0 ? value : MANUAL_FALLBACK_SECONDS;
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return rest === 0 ? `${minutes}m` : `${minutes}m${String(rest).padStart(2, "0")}`;
}

function paceClock(seconds: number): string {
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

function paceTarget(step: WorkoutStepInput): string | null {
  const min = step.pace_min_s_km;
  const max = step.pace_max_s_km;
  if (min == null && max == null) return null;
  const fast = min ?? Math.max(120, (max as number) - 10);
  const slow = max ?? Math.min(1_200, (min as number) + 10);
  // Nel builder l'esempio scrive prima il passo lento: "5:00-4:40/km".
  return `${paceClock(Math.max(fast, slow))}-${paceClock(Math.min(fast, slow))}/km Pace`;
}

function hrTarget(step: WorkoutStepInput, maxHr: number | null): string | null {
  if (!maxHr || maxHr <= 0) return null;
  const min = step.hr_min_bpm;
  const max = step.hr_max_bpm;
  if (min == null && max == null) return null;
  const pct = (bpm: number) => Math.min(100, Math.max(30, Math.round((bpm / maxHr) * 100)));
  const low = min != null ? pct(min) : Math.max(30, pct(max as number) - 10);
  const high = max != null ? pct(max) : Math.min(100, pct(min as number) + 10);
  return `${Math.min(low, high)}-${Math.max(low, high)}% HR`;
}

/** Un solo target per fase: passo per i tratti di lavoro, FC per il resto, salvo preferenza. */
export function stepTarget(step: WorkoutStepInput, ctx: IntervalsTargetContext): string | null {
  const pace = paceTarget(step);
  const hr = hrTarget(step, ctx.max_hr);
  if (ctx.preference === "pace") return pace ?? hr;
  if (ctx.preference === "hr") return hr ?? pace;
  const paceFirst = step.kind === "work" || step.kind === "steady";
  return paceFirst ? pace ?? hr : hr ?? pace;
}

export function stepLine(step: WorkoutStepInput, ctx: IntervalsTargetContext): string {
  const target = stepTarget(step, ctx);
  return `- ${cueFor(step)} ${formatIntervalsDuration(step)}${target ? ` ${target}` : ""}`;
}

function fingerprint(step: WorkoutStepInput): string {
  return JSON.stringify([
    step.kind, step.variant ?? null, step.completion_type, step.completion_value,
    step.pace_min_s_km, step.pace_max_s_km, step.hr_min_bpm, step.hr_max_bpm,
  ]);
}

export interface RepeatBlock {
  repeat: number;
  steps: WorkoutStepInput[];
}

/** Raggruppa coppie (o singole fasi) identiche consecutive in blocchi "Nx". */
export function groupRepeats(steps: WorkoutStepInput[]): RepeatBlock[] {
  const blocks: RepeatBlock[] = [];
  let index = 0;
  while (index < steps.length) {
    let matched: RepeatBlock | null = null;
    for (const length of [2, 1]) {
      if (index + length > steps.length) continue;
      const pattern = steps.slice(index, index + length).map(fingerprint).join("|");
      let repeat = 1;
      while (
        index + (repeat + 1) * length <= steps.length
        && steps.slice(index + repeat * length, index + (repeat + 1) * length).map(fingerprint).join("|") === pattern
      ) repeat += 1;
      if (repeat >= 2) {
        matched = { repeat, steps: steps.slice(index, index + length) };
        break;
      }
    }
    if (matched) {
      blocks.push(matched);
      index += matched.repeat * matched.steps.length;
    } else {
      blocks.push({ repeat: 1, steps: [steps[index]] });
      index += 1;
    }
  }
  return blocks;
}

function leadingKind(steps: WorkoutStepInput[], kind: WorkoutStepKind): number {
  let count = 0;
  while (count < steps.length && steps[count].kind === kind) count += 1;
  return count;
}

function trailingKind(steps: WorkoutStepInput[], kind: WorkoutStepKind, from: number): number {
  let count = 0;
  while (steps.length - 1 - count >= from && steps[steps.length - 1 - count].kind === kind) count += 1;
  return count;
}

export function workoutDescription(steps: WorkoutStepInput[], ctx: IntervalsTargetContext): string {
  if (!steps.length) return "";
  const warm = leadingKind(steps, "warmup");
  const cool = trailingKind(steps, "cooldown", warm);
  const warmup = steps.slice(0, warm);
  const main = steps.slice(warm, steps.length - cool);
  const cooldown = steps.slice(steps.length - cool);
  const sections: string[] = [];

  if (warmup.length) sections.push(["Warmup", ...warmup.map((step) => stepLine(step, ctx))].join("\n"));

  if (main.length) {
    const blocks = groupRepeats(main);
    if (blocks.length === 1 && blocks[0].repeat > 1) {
      sections.push([`Main Set ${blocks[0].repeat}x`, ...blocks[0].steps.map((step) => stepLine(step, ctx))].join("\n"));
    } else {
      const lines = ["Main Set"];
      for (const block of blocks) {
        if (block.repeat > 1) lines.push(`${block.repeat}x`);
        lines.push(...block.steps.map((step) => stepLine(step, ctx)));
      }
      sections.push(lines.join("\n"));
    }
  }

  if (cooldown.length) sections.push(["Cooldown", ...cooldown.map((step) => stepLine(step, ctx))].join("\n"));
  return sections.join("\n\n");
}

function distanceLabel(meters: number): string {
  return meters % 1000 === 0 ? `${meters / 1000} km` : `${(meters / 1000).toFixed(1)} km`;
}

export function workoutEventName(workout: IntervalsWorkoutSource): string {
  const main = groupRepeats(workout.steps.filter((step) => step.kind === "work" || step.kind === "recovery" || step.kind === "steady"));
  const repeat = main.find((block) => block.repeat > 1);
  if (repeat) {
    const work = repeat.steps.find((step) => step.kind === "work") ?? repeat.steps[0];
    const unit = work.completion_type === "distance" && work.completion_value
      ? distanceLabel(work.completion_value)
      : work.completion_type === "time" && work.completion_value
        ? `${Math.round(work.completion_value / 60)} min`
        : null;
    return unit ? `${workout.title} · ${repeat.repeat}×${unit}` : workout.title;
  }
  if (workout.target_distance_m) return `${workout.title} · ${distanceLabel(workout.target_distance_m)}`;
  if (workout.target_duration_s) return `${workout.title} · ${Math.round(workout.target_duration_s / 60)} min`;
  return workout.title;
}

export function workoutToIntervalsDraft(workout: IntervalsWorkoutSource, ctx: IntervalsTargetContext): IntervalsWorkoutDraft {
  return {
    category: "WORKOUT",
    type: "Run",
    start_date_local: `${workout.date}T00:00:00`,
    name: workoutEventName(workout),
    description: workoutDescription(workout.steps, ctx),
    external_id: intervalsExternalId(workout.id),
  };
}

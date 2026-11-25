// Guided phases → Intervals.icu "workout builder" text. Pure functions.
//
// Syntax (forum.intervals.icu, "Workout builder syntax quick guide"):
// - each phase is a line "- <cue> <duration> <target>";
// - duration "10m", "90s", "1m30", "1km", "400mtr";
// - absolute pace "5:00-4:40/km Pace", HR as a percentage "70-80% HR";
// - one target per phase, and for Zepp a single type (pace or HR) per session;
// - repeats with a "6x" line (no nesting);
// - phase type at the end: "intensity=warmup|active|recovery|cooldown";
// - sections "Warmup", "Main Set", "Cooldown"; "Main Set 6x" repeats the whole block;
// - each "Nx" block is its own paragraph: it must be separated by a blank line from what
//   follows, otherwise Intervals merges the blocks (the "3x" line ended up at the end
//   of the previous phase and everything became a single "2x").
// Absolute bpm are not documented: HR travels as a % of max HR.

import type { WorkoutStepInput, WorkoutStepKind } from "@/lib/types";
import { formatStepAmount, groupWorkoutSteps } from "../workout-guide.ts";

export type IntervalsTargetPreference = "auto" | "pace" | "hr";

export interface IntervalsTargetContext {
  /** Athlete's effective max HR (Zepp or profile); without it, no HR target. */
  max_hr: number | null;
  preference: IntervalsTargetPreference;
}

export interface IntervalsWorkoutSource {
  id: string;
  date: string;
  /** HH:MM:SS: orders sessions of the same day. Defaults to midnight. */
  start_time?: string;
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
/** Manual phase without a value: Intervals still wants a duration. */
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

// A single limit ("no faster than", "HR ≤ 150") is open on the other side:
// Intervals wants a range, so the missing side goes far away, not close to
// the limit, otherwise the watch warns "too slow" or "low HR" when
// the athlete is doing exactly what the plan asks.
const OPEN_PACE_SPREAD_S = 90;
const OPEN_HR_FLOOR_PCT = 50;
const OPEN_HR_CEILING_PCT = 100;

function paceTarget(step: WorkoutStepInput): string | null {
  const min = step.pace_min_s_km;
  const max = step.pace_max_s_km;
  if (min == null && max == null) return null;
  const fast = min ?? Math.max(120, (max as number) - OPEN_PACE_SPREAD_S);
  const slow = max ?? Math.min(1_200, (min as number) + OPEN_PACE_SPREAD_S);
  // In the builder the example writes the slow pace first: "5:00-4:40/km".
  return `${paceClock(Math.max(fast, slow))}-${paceClock(Math.min(fast, slow))}/km Pace`;
}

function hrTarget(step: WorkoutStepInput, maxHr: number | null): string | null {
  if (!maxHr || maxHr <= 0) return null;
  const min = step.hr_min_bpm;
  const max = step.hr_max_bpm;
  if (min == null && max == null) return null;
  const pct = (bpm: number) => Math.min(100, Math.max(30, Math.round((bpm / maxHr) * 100)));
  const low = min != null ? pct(min) : Math.max(30, Math.min(OPEN_HR_FLOOR_PCT, pct(max as number) - 10));
  const high = max != null ? pct(max) : OPEN_HR_CEILING_PCT;
  return `${Math.min(low, high)}-${Math.max(low, high)}% HR`;
}

export type IntervalsTargetKind = "pace" | "hr";

/**
 * A single target type for the whole session. Zepp, if HR and pace are
 * mixed, keeps HR and drops pace (verified with a Balance 2,
 * November 2026). Automatic: pace if a work segment has a pace
 * (threshold, intervals), otherwise HR (easy, long, recoveries).
 */
export function workoutTargetKind(steps: WorkoutStepInput[], ctx: IntervalsTargetContext): IntervalsTargetKind | null {
  const anyPace = steps.some((step) => paceTarget(step) != null);
  const anyHr = steps.some((step) => hrTarget(step, ctx.max_hr) != null);
  if (!anyPace && !anyHr) return null;
  if (ctx.preference === "pace") return anyPace ? "pace" : "hr";
  if (ctx.preference === "hr") return anyHr ? "hr" : "pace";
  if (steps.some((step) => step.kind === "work" && paceTarget(step) != null)) return "pace";
  return anyHr ? "hr" : "pace";
}

/** Phase target in the type chosen for the session; null if the phase has none of that type. */
export function stepTarget(
  step: WorkoutStepInput,
  ctx: IntervalsTargetContext,
  kind: IntervalsTargetKind | null = workoutTargetKind([step], ctx),
): string | null {
  if (kind === "pace") return paceTarget(step);
  if (kind === "hr") return hrTarget(step, ctx.max_hr);
  return null;
}

// Explicit phase type: Zepp ignores the phase name and shows only the type.
// Without the tag every phase arrives as "Allenamento"; with the tag the watch writes
// Riscaldamento, Allenamento, Ripristina (recovery) and Rilassato (cooldown).
// Verified in the Zepp app with a Balance 2, November 2026.
const INTENSITY: Record<WorkoutStepKind, string> = {
  warmup: "warmup",
  work: "active",
  steady: "active",
  recovery: "recovery",
  cooldown: "cooldown",
};

export function stepLine(step: WorkoutStepInput, ctx: IntervalsTargetContext, kind?: IntervalsTargetKind | null): string {
  const target = stepTarget(step, ctx, kind === undefined ? workoutTargetKind([step], ctx) : kind);
  return `- ${cueFor(step)} ${formatIntervalsDuration(step)}${target ? ` ${target}` : ""} intensity=${INTENSITY[step.kind]}`;
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

/** Groups identical consecutive pairs (or single phases) into "Nx" blocks. */
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

/** Minimum cooldown left after taking the final recovery from it. */
const MIN_COOLDOWN_LEFT = { time: 60, distance: 200 } as const;

/**
 * "2x (work + recovery) + work" before the cooldown becomes "3x": the
 * missing recovery is taken from the start of the cooldown, which is slow
 * running anyway, and the total duration does not change. This way the lap counter
 * on the watch matches the title ("3×8'") and no extra repeat shows up.
 */
export function closeTrailingRepeat(
  main: WorkoutStepInput[],
  cooldown: WorkoutStepInput[],
): { main: WorkoutStepInput[]; cooldown: WorkoutStepInput[] } {
  const blocks = groupRepeats(main);
  const last = blocks[blocks.length - 1];
  const previous = blocks[blocks.length - 2];
  const cool = cooldown[0];
  if (!last || !previous || !cool || last.repeat !== 1 || previous.repeat < 2 || previous.steps.length !== 2) return { main, cooldown };
  const [work, recovery] = previous.steps;
  if (recovery.kind !== "recovery" || fingerprint(work) !== fingerprint(last.steps[0])) return { main, cooldown };
  const type = recovery.completion_type;
  if (type === "manual" || cool.completion_type !== type) return { main, cooldown };
  const left = (cool.completion_value ?? 0) - (recovery.completion_value ?? 0);
  if (left < MIN_COOLDOWN_LEFT[type]) return { main, cooldown };
  return {
    main: [...main, recovery],
    cooldown: [{ ...cool, completion_value: left }, ...cooldown.slice(1)],
  };
}

export function workoutDescription(steps: WorkoutStepInput[], ctx: IntervalsTargetContext): string {
  if (!steps.length) return "";
  const kind = workoutTargetKind(steps, ctx);
  const warm = leadingKind(steps, "warmup");
  const cool = trailingKind(steps, "cooldown", warm);
  const warmup = steps.slice(0, warm);
  const { main, cooldown } = closeTrailingRepeat(steps.slice(warm, steps.length - cool), steps.slice(steps.length - cool));
  const sections: string[] = [];

  if (warmup.length) sections.push(["Warmup", ...warmup.map((step) => stepLine(step, ctx, kind))].join("\n"));

  if (main.length) {
    // One paragraph per repeated block; consecutive single phases stay
    // together in a paragraph without a heading.
    const paragraphs: string[][] = [];
    let singles: string[] | null = null;
    for (const block of groupRepeats(main)) {
      const lines = block.steps.map((step) => stepLine(step, ctx, kind));
      if (block.repeat > 1) {
        paragraphs.push([`${block.repeat}x`, ...lines]);
        singles = null;
      } else {
        if (!singles) {
          singles = [];
          paragraphs.push(singles);
        }
        singles.push(...lines);
      }
    }
    const first = paragraphs[0];
    if (/^\d+x$/.test(first[0])) first[0] = `Main Set ${first[0]}`;
    else first.unshift("Main Set");
    sections.push(paragraphs.map((lines) => lines.join("\n")).join("\n\n"));
  }

  if (cooldown.length) sections.push(["Cooldown", ...cooldown.map((step) => stepLine(step, ctx, kind))].join("\n"));
  return sections.join("\n\n");
}

function distanceLabel(meters: number): string {
  return meters % 1000 === 0 ? `${meters / 1000} km` : `${(meters / 1000).toFixed(1)} km`;
}

export function workoutEventName(workout: IntervalsWorkoutSource): string {
  // Same grouping as the PWA (also counts the last repeat without
  // recovery). The title lists the main repeats, not the strides.
  const repeats = groupWorkoutSteps(workout.steps).flatMap((block) => {
    if (block.kind !== "repeat") return [];
    const work = block.steps.find((step) => step.kind === "work");
    return work ? [{ times: block.times, work }] : [];
  });
  const main = repeats.find((block) => block.work.variant !== "sprint") ?? repeats[0];
  if (main) {
    const unit = formatStepAmount(main.work);
    return unit ? `${workout.title} · ${main.times}×${unit}` : workout.title;
  }
  if (workout.target_distance_m) return `${workout.title} · ${distanceLabel(workout.target_distance_m)}`;
  if (workout.target_duration_s) return `${workout.title} · ${Math.round(workout.target_duration_s / 60)} min`;
  return workout.title;
}

export function workoutToIntervalsDraft(workout: IntervalsWorkoutSource, ctx: IntervalsTargetContext): IntervalsWorkoutDraft {
  return {
    category: "WORKOUT",
    type: "Run",
    start_date_local: `${workout.date}T${workout.start_time ?? "00:00:00"}`,
    name: workoutEventName(workout),
    description: workoutDescription(workout.steps, ctx),
    external_id: intervalsExternalId(workout.id),
  };
}

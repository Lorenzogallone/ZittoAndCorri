// Coach proposals day by day. The model may also return sessions
// identical to those already on the calendar or days it cannot touch: here we
// keep only what really changes, and a day is cleared only if the proposal
// explicitly asks for it. The sessions proposed for a day replace
// all those on the calendar that day (which may have several); on a
// day already run, from today on, they are simply added. Pure functions (the
// same protection is repeated in SQL by apply_plan_proposal_v2).

import type { DayPart, WorkoutStepInput, WorkoutType } from "@/lib/types";
import { numberDaySessions, sortByDayOrder } from "./day-sessions.ts";
import { estimateWorkout } from "../workout-estimate.ts";
import { stepVariant, workoutHeadline } from "../workout-guide.ts";

export interface PlanDayWorkout {
  date: string;
  type: WorkoutType;
  status?: string;
  target_distance_m: number | null;
  target_duration_s: number | null;
  target_pace_s_km?: number | null;
  target_hr_bpm?: number | null;
  workout_steps: WorkoutStepInput[];
  description?: string | null;
  focus?: string | null;
  day_order?: number | null;
  day_part?: DayPart | null;
  chained?: boolean | null;
}

/** Short session, for the before/after in chat. */
export interface WorkoutBrief {
  type: WorkoutType;
  headline: string | null;
  meters: number | null;
  minutes: number | null;
  day_part?: DayPart | null;
    /** Right after the previous session of the same day. */
  chained?: boolean;
}

export interface ProposalChange {
  date: string;
  before: WorkoutBrief[];
  after: WorkoutBrief[];
}

export interface ProposalDiff<W extends PlanDayWorkout> {
  workouts: W[];
  removeDates: string[];
    /** Days the proposal really modifies, in order. */
  touched: string[];
  changes: ProposalChange[];
    /** Days requested but untouchable (past, already run, outside the window). */
  locked: string[];
    /** Already-run days where the new sessions are added without touching the existing ones. */
  added: string[];
}

export function briefOf(workout: PlanDayWorkout): WorkoutBrief {
  const steps = workout.workout_steps ?? [];
  const estimate = steps.length ? estimateWorkout(steps) : null;
  const meters = workout.target_distance_m ?? (estimate ? Math.round(estimate.meters / 100) * 100 : null);
  const seconds = workout.target_duration_s ?? (estimate ? estimate.seconds : null);
  return {
    type: workout.type,
    headline: steps.length ? workoutHeadline(steps) : null,
    meters: meters && meters > 0 ? meters : null,
    minutes: seconds && seconds > 0 ? Math.round(seconds / 60) : null,
    day_part: workout.day_part ?? null,
    chained: workout.chained === true,
  };
}

/** Fingerprint of a session (with or without place in the day): equal = no change. */
function fingerprint(workout: PlanDayWorkout, withPlacement = true): string {
  return JSON.stringify([
    withPlacement ? [workout.day_order ?? 1, workout.day_part ?? null, workout.chained === true] : null,
    workout.type,
    workout.target_distance_m ?? null,
    workout.target_duration_s ?? null,
    workout.target_pace_s_km ?? null,
    workout.target_hr_bpm ?? null,
    (workout.workout_steps ?? []).map((step) => [
      step.kind, step.completion_type, step.completion_value ?? null,
      step.pace_min_s_km ?? null, step.pace_max_s_km ?? null,
      step.hr_min_bpm ?? null, step.hr_max_bpm ?? null, stepVariant(step),
    ]),
  ]);
}

const sameDay = (a: PlanDayWorkout[], b: PlanDayWorkout[]) =>
  a.length === b.length && a.map((w) => fingerprint(w)).sort().join("\n") === b.map((w) => fingerprint(w)).sort().join("\n");

export function planProposalDiff<W extends PlanDayWorkout>(input: {
  today: string;
  windowEnd: string;
    /** First past day that can still be cleared (skipped or moved session). Default: today. */
  removeFrom?: string;
    /** Sessions already on the calendar in the window (any status). */
  existing: PlanDayWorkout[];
    /** Days with a recorded run (Europe/Rome). */
  activityDates: Set<string>;
  proposed: W[];
  removeDates: string[];
}): ProposalDiff<W> {
  const { today, windowEnd, existing, activityDates } = input;
  const removeFrom = input.removeFrom ?? today;
  const editable = (w: PlanDayWorkout) => w.status !== "completed";
  const doneOn = (date: string) =>
    activityDates.has(date) || existing.some((w) => w.date === date && w.status === "completed");
    // New sessions only from today on; a past day not run can be
    // cleared (skipped session, or moved to today) up to removeFrom.
  const isLocked = (date: string) => date < today || date > windowEnd;
  const isRemoveLocked = (date: string) => date < removeFrom || date > windowEnd || doneOn(date);
  const existingOn = (date: string) => sortByDayOrder(existing.filter((w) => w.date === date && editable(w)));
  const allOn = (date: string) => sortByDayOrder(existing.filter((w) => w.date === date));

    // A day's sessions in the order given by the model: 1, 2, … in the day.
  const grouped = new Map<string, W[]>();
  for (const workout of input.proposed) grouped.set(workout.date, [...(grouped.get(workout.date) ?? []), workout]);
  const byDate = new Map<string, W[]>([...grouped].map(([date, list]) => [date, numberDaySessions(list)]));

  const locked = new Set<string>();
  const added = new Set<string>();
  const workouts: W[] = [];
  const changed = new Set<string>();
  const after = new Map<string, PlanDayWorkout[]>();
  for (const [date, list] of byDate) {
    if (isLocked(date)) {
      locked.add(date);
      continue;
    }
    if (doneOn(date)) {
            // Day already run: existing sessions stay, only the new ones are
            // added (e.g. a second session in the evening). Repeating one does not count.
      const before = allOn(date);
      const known = new Set(before.map((w) => fingerprint(w, false)));
      const last = before[before.length - 1];
      const fresh = numberDaySessions(
        (grouped.get(date) ?? []).filter((w) => !known.has(fingerprint(w, false))),
        Math.max(0, ...before.map((w) => w.day_order ?? 1)) + 1,
        last?.day_part ?? null,
      );
      if (!fresh.length) continue;
      workouts.push(...fresh);
      changed.add(date);
      added.add(date);
      after.set(date, [...before, ...fresh]);
      continue;
    }
        // The model repeats a session without changing it: not a change.
    if (sameDay(existingOn(date), list)) continue;
    workouts.push(...list);
    changed.add(date);
    after.set(date, list);
  }

  const removeDates: string[] = [];
  for (const date of [...new Set(input.removeDates)].sort()) {
    if (byDate.has(date)) continue;
    if (isRemoveLocked(date)) {
      if (existingOn(date).length) locked.add(date);
      continue;
    }
        // Clearing an already empty day changes nothing.
    if (!existingOn(date).length) continue;
    removeDates.push(date);
    changed.add(date);
  }

  const touched = [...changed].sort();
  return {
    workouts: sortByDayOrder(workouts),
    removeDates,
    touched,
    changes: touched.map((date) => ({
      date,
      before: (added.has(date) ? allOn(date) : existingOn(date)).map(briefOf),
      after: (after.get(date) ?? []).map(briefOf),
    })),
    locked: [...locked].sort(),
    added: [...added].sort(),
  };
}

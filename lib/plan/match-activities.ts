// Matches the planned sessions of a day to the activities done that day.
// With several sessions and several runs on the same day (warm-up and repeats,
// morning and evening) the first run is not necessarily the first session: we pick
// the match that is most similar in distance, duration, order and time
// of day. A session left without a run counts as done even with a
// run of the same type done up to two days before or after (matchPlan).
// Pure functions.

import type { DayPart, WorkoutStepInput, WorkoutType } from "../types.ts";
import { plannedMeters } from "./planned-distance.ts";
import { estimateWorkout } from "../workout-estimate.ts";
import { addDays, daysBetween, romeDay } from "../local-date.ts";

export interface MatchWorkout {
  id: string;
  type: WorkoutType;
  status?: string;
  target_distance_m: number | null;
  target_duration_s: number | null;
  target_pace_s_km?: number | null;
  workout_steps?: WorkoutStepInput[] | null;
  day_order?: number | null;
  day_part?: DayPart | null;
}

export interface MatchActivity {
  id: string;
  started_at: string;
  sport: string;
  distance_m: number;
  duration_s: number;
  moving_time_s?: number | null;
}

/** Hour of the day in Rome (0-23). */
function romeHour(iso: string): number {
  return Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Europe/Rome" }).format(new Date(iso))) % 24;
}

function partOf(hour: number): DayPart {
  return hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
}

/** Mean (log) difference in distance and duration; null if it cannot be determined. */
function gap(workout: MatchWorkout, activity: MatchActivity): number | null {
  const steps = workout.workout_steps ?? [];
  const meters = plannedMeters({ ...workout, workout_steps: steps });
  const seconds = workout.target_duration_s ?? (steps.length ? estimateWorkout(steps).seconds : 0);
  const active = activity.moving_time_s ?? activity.duration_s;
  const gaps: number[] = [];
  if (meters > 0 && activity.distance_m > 0) gaps.push(Math.abs(Math.log(activity.distance_m / meters)));
  if (seconds > 0 && active > 0) gaps.push(Math.abs(Math.log(active / seconds)));
  return gaps.length ? gaps.reduce((sum, value) => sum + value, 0) / gaps.length : null;
}

/** How different the session and the activity are (0 = identical). Infinity if incompatible. */
function cost(workout: MatchWorkout, activity: MatchActivity, workoutRank: number, activityRank: number): number {
  if (workout.type !== "cross" && activity.sport !== "running") return Infinity;
  let total = gap(workout, activity) ?? 0.5;
    // On equal similarity, order counts: first session with first run.
  total += Math.abs(workoutRank - activityRank) * 0.15;
  if (workout.day_part && workout.day_part !== partOf(romeHour(activity.started_at))) total += 0.5;
  return total;
}

/**
 * Session → activity matching for a day: the maximum number of pairs and,
 * among those, the most similar one. Each activity counts for only one session.
 * Returns session id → activity id (sessions without a run do not appear).
 */
export function matchDay(workouts: MatchWorkout[], activities: MatchActivity[]): Map<string, string> {
  const plan = [...workouts]
    .filter((workout) => workout.status !== "skipped")
    .map((workout, index) => ({ workout, index }))
    .sort((a, b) => (a.workout.day_order ?? 1) - (b.workout.day_order ?? 1) || a.index - b.index)
    .map(({ workout }) => workout);
  const done = [...activities].sort((a, b) => a.started_at.localeCompare(b.started_at));
  const result = new Map<string, string>();
  if (!plan.length || !done.length) return result;

  const costs = plan.map((workout, i) => done.map((activity, j) => cost(workout, activity, i, j)));
    // Few sessions and few runs per day: all combinations are tried.
  if (plan.length <= 6 && done.length <= 6) {
    let best: { pairs: number; total: number; choice: number[] } = { pairs: 0, total: Infinity, choice: [] };
    const choice = new Array<number>(plan.length).fill(-1);
    const used = new Set<number>();
    const walk = (i: number, pairs: number, total: number) => {
      if (i === plan.length) {
        if (pairs > best.pairs || (pairs === best.pairs && total < best.total)) best = { pairs, total, choice: [...choice] };
        return;
      }
      for (let j = 0; j < done.length; j++) {
        if (used.has(j) || !Number.isFinite(costs[i][j])) continue;
        used.add(j);
        choice[i] = j;
        walk(i + 1, pairs + 1, total + costs[i][j]);
        used.delete(j);
      }
      choice[i] = -1;
      walk(i + 1, pairs, total);
    };
    walk(0, 0, 0);
    best.choice.forEach((j, i) => {
      if (j >= 0) result.set(plan[i].id, done[j].id);
    });
    return result;
  }
    // Unusual days: in order, the first free compatible run.
  const used = new Set<number>();
  plan.forEach((workout, i) => {
    const j = done.findIndex((_, index) => !used.has(index) && Number.isFinite(costs[i][index]));
    if (j >= 0) {
      used.add(j);
      result.set(workout.id, done[j].id);
    }
  });
  return result;
}

/** The session matched to an activity, if any. */
export function workoutForActivity<W extends MatchWorkout>(activityId: string, workouts: W[], activities: MatchActivity[]): W | null {
  const match = matchDay(workouts, activities);
  for (const workout of workouts) {
    if (match.get(workout.id) === activityId) return workout;
  }
  return null;
}

// ── Sessions moved to another day ───────────────────────────────────────────

/** How many days before or after a run counts for a session left without one. */
export const SHIFT_DAYS = 2;
/**
 * Margin to load around the displayed days: runs at ±SHIFT_DAYS and the
 * sessions competing for them (themselves within ±SHIFT_DAYS of those runs).
 */
export const MATCH_MARGIN_DAYS = 2 * SHIFT_DAYS;

export interface PlanMatchWorkout extends MatchWorkout {
  date: string;
}

export interface PlanMatchActivity extends MatchActivity {
    /** Run type; "unclassified" or missing = not decided yet. */
  type?: string | null;
}

/** Run types that count for a session done on another day. Race and cross stay on their own day. */
const SHIFT_TYPES: Partial<Record<WorkoutType, string[]>> = {
  easy: ["easy", "recovery"],
  recovery: ["easy", "recovery"],
  long: ["long"],
  tempo: ["tempo"],
  interval: ["interval"],
};
/** Run with no type: it must resemble the session (distance and duration within ~35%). */
const UNTYPED_MAX_GAP = 0.3;

function shiftable(workout: PlanMatchWorkout, activity: PlanMatchActivity): boolean {
  const types = SHIFT_TYPES[workout.type];
  if (!types || activity.sport !== "running") return false;
  if (activity.type && activity.type !== "unclassified") return types.includes(activity.type);
  const value = gap(workout, activity);
  return value != null && value <= UNTYPED_MAX_GAP;
}

/**
 * Session → activity matching across days. First each day with its own
 * runs (matchDay: a same-day run always takes precedence and
 * no session already done on its day is removed). Then the sessions left
 * without a run take a free leftover run of the same type, up to
 * SHIFT_DAYS days before or after: the closest first, on ties the one done
 * after the session (moved forward), then the most similar. Returns session id →
 * activity id. For a stable result, sessions and runs are needed also for
 * MATCH_MARGIN_DAYS around the days of interest.
 */
export function matchPlan(workouts: PlanMatchWorkout[], activities: PlanMatchActivity[]): Map<string, string> {
  const result = new Map<string, string>();
  const dayOf = new Map(activities.map((activity) => [activity.id, romeDay(activity.started_at)]));
  for (const date of [...new Set(workouts.map((workout) => workout.date))].sort()) {
    const dayMatch = matchDay(
      workouts.filter((workout) => workout.date === date),
      activities.filter((activity) => dayOf.get(activity.id) === date),
    );
    for (const [workoutId, activityId] of dayMatch) result.set(workoutId, activityId);
  }

  const used = new Set(result.values());
  const pairs: Array<{ workout: PlanMatchWorkout; activity: PlanMatchActivity; distance: number; earlier: number; similarity: number }> = [];
  for (const workout of workouts) {
    if (workout.status === "skipped" || result.has(workout.id)) continue;
    for (const activity of activities) {
      if (used.has(activity.id)) continue;
      const shift = daysBetween(workout.date, dayOf.get(activity.id)!);
      if (shift === 0 || Math.abs(shift) > SHIFT_DAYS || !shiftable(workout, activity)) continue;
      pairs.push({ workout, activity, distance: Math.abs(shift), earlier: shift < 0 ? 1 : 0, similarity: gap(workout, activity) ?? 0.5 });
    }
  }
  pairs.sort((a, b) =>
    a.distance - b.distance
    || a.earlier - b.earlier
    || a.similarity - b.similarity
    || a.workout.date.localeCompare(b.workout.date)
    || a.workout.id.localeCompare(b.workout.id)
    || a.activity.started_at.localeCompare(b.activity.started_at)
    || a.activity.id.localeCompare(b.activity.id));
  for (const { workout, activity } of pairs) {
    if (result.has(workout.id) || used.has(activity.id)) continue;
    result.set(workout.id, activity.id);
    used.add(activity.id);
  }
  return result;
}

/** The session matched to an activity across days (see matchPlan), if any. */
export function planWorkoutForActivity<W extends PlanMatchWorkout>(activityId: string, workouts: W[], activities: PlanMatchActivity[]): W | null {
  const match = matchPlan(workouts, activities);
  return workouts.find((workout) => match.get(workout.id) === activityId) ?? null;
}

/**
 * Only the activities of the window's days: those loaded extra for the
 * time zone have no sessions of their own and would look free.
 */
export function withinWindow<A extends MatchActivity>(activities: A[], range: { from: string; to: string }): A[] {
  return activities.filter((activity) => {
    const day = romeDay(activity.started_at);
    return day >= range.from && day <= range.to;
  });
}

/** Range of days to load to match sessions from `from` to `to`. */
export function matchWindow(from: string, to: string = from): { from: string; to: string } {
  return { from: addDays(from, -MATCH_MARGIN_DAYS), to: addDays(to, MATCH_MARGIN_DAYS) };
}

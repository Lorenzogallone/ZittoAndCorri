import "server-only";

// Derived metrics saved on activities: best effort and pace check.
// They are computed at import and, for history, in the background on first visit.
// Never blocking: an error here must not make an import fail.

import type { SupabaseClient } from "@supabase/supabase-js";
import { bestEffortsForActivity } from "@/lib/metrics/best-efforts";
import { checkPace, stepsToCheck, type PaceCheck } from "@/lib/metrics/pace-check";
import {
  analyzeIntervals,
  describeStructure,
  isStructured,
  INTERVALS_VERSION,
  type DeclaredStructure,
  type DistancePoint,
  type FitLap,
  type IntervalAnalysis,
} from "@/lib/metrics/intervals";
import { addDays, romeDay } from "@/lib/local-date";
import { matchWindow, planWorkoutForActivity, withinWindow } from "@/lib/plan/match-activities";
import { avgPace } from "@/lib/metrics/pace";
import { movingTimeFromStreams } from "@/lib/metrics/pauses";
import { classifyRun } from "@/lib/metrics/run-type";
import { workoutStepsOrLegacy } from "@/lib/workout-steps";
import type { Activity, ActivityStream, GpsPoint, HrPoint, PlannedWorkout } from "@/lib/types";

type DerivedActivity = Pick<Activity, "id" | "sport" | "started_at" | "distance_m" | "duration_s" | "moving_time_s">;

type DayActivity = Pick<Activity, "id" | "started_at" | "type" | "sport" | "distance_m" | "duration_s" | "moving_time_s">;

/**
 * Planned session matched to an activity: with several sessions and several runs on the
 * same day it is not the first one, but the one that resembles it most (distance,
 * duration, order, time). If the run doesn't serve a session of its own day
 * it can count for a session of the same type left without a run up to two
 * days before or after (matchPlan). An activity that matches no
 * session (e.g. an extra run) has no session.
 */
export async function plannedForActivity(
  supabase: SupabaseClient,
  userId: string,
  activity: Pick<Activity, "id" | "started_at">,
): Promise<PlannedWorkout | null> {
  const day = romeDay(activity.started_at);
  const range = matchWindow(day);
  const select = "id, started_at, type, sport, distance_m, duration_s, moving_time_s";
  const [{ data: workouts }, { data: activities }] = await Promise.all([
    supabase
      .from("planned_workouts")
      .select("*")
      .eq("user_id", userId)
      .gte("date", range.from)
      .lte("date", range.to)
      .returns<PlannedWorkout[]>(),
    supabase
      .from("activities")
      .select(select)
      .eq("user_id", userId)
      .is("excluded_at", null)
      .gte("started_at", `${addDays(range.from, -1)}T12:00:00Z`)
      .lte("started_at", `${addDays(range.to, 1)}T12:00:00Z`)
      .returns<DayActivity[]>(),
  ]);
  const plan = (workouts ?? []).map((workout) => ({ ...workout, workout_steps: workoutStepsOrLegacy(workout.workout_steps, workout) }));
  if (!plan.length) return null;
  const nearby = withinWindow(activities ?? [], range);
  // The activity itself is always there (even if excluded or just saved).
  if (!nearby.some((other) => other.id === activity.id)) {
    const { data: self } = await supabase
      .from("activities")
      .select(select)
      .eq("id", activity.id)
      .maybeSingle<DayActivity>();
    if (self) nearby.push(self);
  }
  return planWorkoutForActivity(activity.id, plan, nearby);
}

/** Session matched to the activity, if it has pace segments to check. */
async function plannedWithPace(
  supabase: SupabaseClient,
  userId: string,
  activity: Pick<Activity, "id" | "started_at">,
): Promise<PlannedWorkout | null> {
  const workout = await plannedForActivity(supabase, userId, activity);
  return workout && workout.type !== "cross" && stepsToCheck(workoutStepsOrLegacy(workout.workout_steps, workout)).length > 0 ? workout : null;
}

export async function paceCheckFor(
  supabase: SupabaseClient,
  userId: string,
  activity: Pick<Activity, "id" | "sport" | "started_at">,
  gps: GpsPoint[] | null | undefined,
): Promise<{ check: PaceCheck; workout: PlannedWorkout } | null> {
  if (activity.sport !== "running" || !gps || gps.length < 10) return null;
  const workout = await plannedWithPace(supabase, userId, activity);
  if (!workout) return null;
  const check = checkPace(gps, workoutStepsOrLegacy(workout.workout_steps, workout));
  return check ? { check, workout } : null;
}

// ── Repeats ────────────────────────────────────────────────────────────────

export interface DerivedStreams {
  gps?: GpsPoint[] | null;
  hr?: HrPoint[] | null;
  distance?: DistancePoint[] | null;
  laps?: FitLap[] | null;
  /** FIT cadence (rpm): tells walking from jogging better than speed. */
  cadence?: Array<{ t: number; rpm: number }> | null;
}

export type DeclaredIntervals = NonNullable<IntervalAnalysis["declared"]>;

/** Column not created yet: migration 0022 has not been run. */
export const isMissingColumn = (error: { code?: string } | null | undefined) =>
  error?.code === "42703" || error?.code === "PGRST204";

/** The cadence column is free-form jsonb: keep only valid {t, rpm} points. */
export function cadencePoints(value: unknown): Array<{ t: number; rpm: number }> | null {
  if (!Array.isArray(value)) return null;
  const points = value.filter((p): p is { t: number; rpm: number } =>
    typeof p?.t === "number" && typeof p?.rpm === "number");
  return points.length ? points : null;
}

/** Activity streams, including distance and laps when the migration is there. */
export async function loadStreams(supabase: SupabaseClient, activityId: string): Promise<DerivedStreams> {
  const { data } = await supabase
    .from("activity_streams")
    .select("*")
    .eq("activity_id", activityId)
    .maybeSingle<ActivityStream>();
  return {
    gps: data?.gps_series ?? null,
    hr: data?.hr_series ?? null,
    distance: data?.distance_series ?? null,
    laps: data?.laps ?? null,
    cadence: cadencePoints(data?.cadence),
  };
}

/**
 * Segments of the run: from laps, from the structure written in the note (which wins
 * over the plan: it is what the athlete says they did) or from the day's session.
 * The session type counts even without a structure: with a long run in the plan the
 * automatic detection asks for clear repeats.
 */
export async function computeIntervals(
  supabase: SupabaseClient,
  userId: string,
  activity: Pick<Activity, "id" | "sport" | "started_at">,
  streams: DerivedStreams,
  declared: DeclaredIntervals | null,
): Promise<IntervalAnalysis | null> {
  if (activity.sport !== "running") return null;
  const structures: DeclaredStructure[] = [];
  if (declared?.steps.length) structures.push({ source: "notes", steps: declared.steps, description: declared.description });
  const found = await plannedForActivity(supabase, userId, activity);
  const workout = found && found.type !== "cross" ? found : null;
  const steps = workout ? workoutStepsOrLegacy(workout.workout_steps, workout) : [];
  if (workout && isStructured(steps)) structures.push({ source: "plan", steps, description: describeStructure(steps) });
  return { ...analyzeIntervals({ ...streams, structures, planned: workout?.type ?? null }), declared };
}

/** Saved analysis still valid (same algorithm version). */
export const intervalsUpToDate = (intervals: IntervalAnalysis | null | undefined) =>
  intervals?.version === INTERVALS_VERSION;

/**
 * Recomputes and saves the segments. `declared` undefined = keep the structure already
 * read from the note. Without migration 0022 it does nothing.
 */
export async function persistIntervals(
  supabase: SupabaseClient,
  userId: string,
  activity: Pick<Activity, "id" | "sport" | "started_at">,
  streams?: DerivedStreams,
  declared?: DeclaredIntervals | null,
): Promise<IntervalAnalysis | null> {
  try {
    if (activity.sport !== "running") return null;
    let keep = declared;
    if (keep === undefined) {
      const { data, error } = await supabase
        .from("activities")
        .select("intervals")
        .eq("id", activity.id)
        .eq("user_id", userId)
        .maybeSingle<{ intervals: IntervalAnalysis | null }>();
      if (isMissingColumn(error)) return null;
      if (error) throw error;
      keep = data?.intervals?.declared ?? null;
    }
    const analysis = await computeIntervals(supabase, userId, activity, streams ?? await loadStreams(supabase, activity.id), keep);
    const { error } = await supabase
      .from("activities")
      .update({ intervals: analysis })
      .eq("id", activity.id)
      .eq("user_id", userId);
    if (isMissingColumn(error)) return analysis;
    if (error) throw error;
    await persistRunType(supabase, userId, activity, analysis);
    return analysis;
  } catch (error) {
    console.error("persistIntervals:", error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Type of the imported run ("unclassified") from the segments and the plan's
 * session. A type already chosen (by hand or earlier) is not touched.
 */
export async function persistRunType(
  supabase: SupabaseClient,
  userId: string,
  activity: Pick<Activity, "id" | "sport" | "started_at">,
  analysis: IntervalAnalysis | null,
): Promise<void> {
  try {
    if (activity.sport !== "running") return;
    const { data: current } = await supabase
      .from("activities")
      .select("type, distance_m, moving_time_s, duration_s")
      .eq("id", activity.id)
      .eq("user_id", userId)
      .maybeSingle<Pick<Activity, "type" | "distance_m" | "moving_time_s" | "duration_s">>();
    if (!current || current.type !== "unclassified") return;
    const planned = await plannedForActivity(supabase, userId, activity);
    const type = classifyRun({
      intervals: analysis,
      planned: planned && planned.type !== "cross" ? planned.type : null,
      distance_m: current.distance_m,
      moving_time_s: current.moving_time_s,
      duration_s: current.duration_s,
    });
    const { error } = await supabase
      .from("activities")
      .update({ type })
      .eq("id", activity.id)
      .eq("user_id", userId)
      .eq("type", "unclassified");
    if (error) throw error;
  } catch (error) {
    console.error("persistRunType:", error instanceof Error ? error.message : error);
  }
}

/** Computes and saves best_efforts, pace_check and repeats of an activity. */
export async function persistDerived(
  supabase: SupabaseClient,
  userId: string,
  activity: DerivedActivity,
  gps: GpsPoint[] | null | undefined,
  streams?: DerivedStreams,
): Promise<void> {
  try {
    const bestEfforts = bestEffortsForActivity({ ...activity, gps });
    const pace = await paceCheckFor(supabase, userId, activity, gps);
    const { error } = await supabase
      .from("activities")
      .update({ best_efforts: bestEfforts, pace_check: pace?.check ?? null })
      .eq("id", activity.id)
      .eq("user_id", userId);
    if (error) throw error;
  } catch (error) {
    console.error("persistDerived:", error instanceof Error ? error.message : error);
  }
  await persistIntervals(supabase, userId, activity, streams);
}

/** Completes in the background the runs imported before best efforts. */
export async function backfillDerived(supabase: SupabaseClient, userId: string, limit = 25): Promise<void> {
  try {
    const { data: pending } = await supabase
      .from("activities")
      .select("id, sport, started_at, distance_m, duration_s, moving_time_s")
      .eq("user_id", userId)
      .eq("sport", "running")
      .is("best_efforts", null)
      .order("started_at", { ascending: false })
      .limit(limit)
      .returns<DerivedActivity[]>();
    for (const activity of pending ?? []) {
      const { data: stream } = await supabase
        .from("activity_streams")
        .select("gps_series")
        .eq("activity_id", activity.id)
        .maybeSingle<{ gps_series: GpsPoint[] | null }>();
      await persistDerived(supabase, userId, activity, stream?.gps_series ?? null);
    }
  } catch (error) {
    console.error("backfillDerived:", error instanceof Error ? error.message : error);
  }
}

/**
 * Moving time for activities saved without it (files that don't say):
 * it is derived from the pauses in the streams and the pace is recomputed. Without pauses the
 * moving time is the total time: it is saved anyway, so the activity
 * is not rechecked on every visit.
 */
export async function backfillMovingTime(supabase: SupabaseClient, userId: string, limit = 30): Promise<void> {
  try {
    const { data: pending } = await supabase
      .from("activities")
      .select("id, distance_m, duration_s")
      .eq("user_id", userId)
      .is("moving_time_s", null)
      .gt("duration_s", 0)
      .order("started_at", { ascending: false })
      .limit(limit)
      .returns<Array<Pick<Activity, "id" | "distance_m" | "duration_s">>>();
    if (!pending?.length) return;
    const { data: streams } = await supabase
      .from("activity_streams")
      .select("*")
      .in("activity_id", pending.map((activity) => activity.id))
      .returns<ActivityStream[]>();
    const byActivity = new Map((streams ?? []).map((stream) => [stream.activity_id, stream]));
    for (const activity of pending) {
      const stream = byActivity.get(activity.id);
      const moving = stream
        ? movingTimeFromStreams(activity.duration_s, { distance: stream.distance_series, gps: stream.gps_series })
        : null;
      const { error } = await supabase
        .from("activities")
        .update({
          moving_time_s: moving ?? activity.duration_s,
          ...(moving != null && activity.distance_m > 0 ? { avg_pace_s_km: avgPace(activity.distance_m, moving) } : {}),
        })
        .eq("id", activity.id)
        .eq("user_id", userId);
      if (error) throw error;
    }
  } catch (error) {
    console.error("backfillMovingTime:", error instanceof Error ? error.message : error);
  }
}

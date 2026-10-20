import "server-only";

// Metriche derivate salvate sulle attività: best effort e verifica del passo.
// Si calcolano all'import e, per lo storico, in background alla prima visita.
// Mai bloccanti: un errore qui non deve far fallire un import.

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
import { romeDay } from "@/lib/local-date";
import { workoutStepsOrLegacy } from "@/lib/workout-steps";
import type { Activity, ActivityStream, GpsPoint, HrPoint, PlannedWorkout } from "@/lib/types";

type DerivedActivity = Pick<Activity, "id" | "sport" | "started_at" | "distance_m" | "duration_s" | "moving_time_s">;

/** Seduta pianificata dello stesso giorno con tratti a passo da verificare. */
async function plannedWithPace(
  supabase: SupabaseClient,
  userId: string,
  day: string,
): Promise<PlannedWorkout | null> {
  const { data } = await supabase
    .from("planned_workouts")
    .select("*")
    .eq("user_id", userId)
    .eq("date", day)
    .neq("type", "cross")
    .returns<PlannedWorkout[]>();
  return (data ?? []).find((workout) => stepsToCheck(workoutStepsOrLegacy(workout.workout_steps, workout)).length > 0) ?? null;
}

export async function paceCheckFor(
  supabase: SupabaseClient,
  userId: string,
  activity: Pick<Activity, "sport" | "started_at">,
  gps: GpsPoint[] | null | undefined,
): Promise<{ check: PaceCheck; workout: PlannedWorkout } | null> {
  if (activity.sport !== "running" || !gps || gps.length < 10) return null;
  const workout = await plannedWithPace(supabase, userId, romeDay(activity.started_at));
  if (!workout) return null;
  const check = checkPace(gps, workoutStepsOrLegacy(workout.workout_steps, workout));
  return check ? { check, workout } : null;
}

// ── Ripetute ────────────────────────────────────────────────────────────────

export interface DerivedStreams {
  gps?: GpsPoint[] | null;
  hr?: HrPoint[] | null;
  distance?: DistancePoint[] | null;
  laps?: FitLap[] | null;
  /** Cadenza FIT (rpm): distingue camminata e jogging meglio della velocità. */
  cadence?: Array<{ t: number; rpm: number }> | null;
}

export type DeclaredIntervals = NonNullable<IntervalAnalysis["declared"]>;

/** Colonna non ancora creata: la migration 0022 non è stata eseguita. */
export const isMissingColumn = (error: { code?: string } | null | undefined) =>
  error?.code === "42703" || error?.code === "PGRST204";

/** La colonna cadence è jsonb libero: tiene solo i punti {t, rpm} validi. */
export function cadencePoints(value: unknown): Array<{ t: number; rpm: number }> | null {
  if (!Array.isArray(value)) return null;
  const points = value.filter((p): p is { t: number; rpm: number } =>
    typeof p?.t === "number" && typeof p?.rpm === "number");
  return points.length ? points : null;
}

/** Stream dell'attività, inclusi distanza e lap quando la migration c'è. */
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

/** Seduta del giorno con una struttura da riconoscere (ripetute, progressivi…). */
async function plannedStructure(supabase: SupabaseClient, userId: string, day: string): Promise<PlannedWorkout | null> {
  const { data } = await supabase
    .from("planned_workouts")
    .select("*")
    .eq("user_id", userId)
    .eq("date", day)
    .neq("type", "cross")
    .returns<PlannedWorkout[]>();
  return (data ?? []).find((workout) => isStructured(workoutStepsOrLegacy(workout.workout_steps, workout))) ?? null;
}

/**
 * Tratti della corsa: dai lap, dalla struttura scritta nella nota (che vince
 * sul piano: è quello che l'atleta dice di aver fatto) o dalla seduta del giorno.
 */
export async function computeIntervals(
  supabase: SupabaseClient,
  userId: string,
  activity: Pick<Activity, "sport" | "started_at">,
  streams: DerivedStreams,
  declared: DeclaredIntervals | null,
): Promise<IntervalAnalysis | null> {
  if (activity.sport !== "running") return null;
  const structures: DeclaredStructure[] = [];
  if (declared?.steps.length) structures.push({ source: "notes", steps: declared.steps, description: declared.description });
  const workout = await plannedStructure(supabase, userId, romeDay(activity.started_at));
  if (workout) {
    const steps = workoutStepsOrLegacy(workout.workout_steps, workout);
    structures.push({ source: "plan", steps, description: describeStructure(steps) });
  }
  return { ...analyzeIntervals({ ...streams, structures }), declared };
}

/** Analisi salvata ancora valida (stessa versione dell'algoritmo). */
export const intervalsUpToDate = (intervals: IntervalAnalysis | null | undefined) =>
  intervals?.version === INTERVALS_VERSION;

/**
 * Ricalcola e salva i tratti. `declared` undefined = conserva la struttura già
 * letta dalla nota. Senza la migration 0022 non fa nulla.
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
    return analysis;
  } catch (error) {
    console.error("persistIntervals:", error instanceof Error ? error.message : error);
    return null;
  }
}

/** Calcola e salva best_efforts, pace_check e ripetute di un'attività. */
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

/** Completa in background le corse importate prima dei best effort. */
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

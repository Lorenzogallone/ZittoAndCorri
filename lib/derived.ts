import "server-only";

// Metriche derivate salvate sulle attività: best effort e verifica del passo.
// Si calcolano all'import e, per lo storico, in background alla prima visita.
// Mai bloccanti: un errore qui non deve far fallire un import.

import type { SupabaseClient } from "@supabase/supabase-js";
import { bestEffortsForActivity } from "@/lib/metrics/best-efforts";
import { checkPace, stepsToCheck, type PaceCheck } from "@/lib/metrics/pace-check";
import { romeDay } from "@/lib/local-date";
import { workoutStepsOrLegacy } from "@/lib/workout-steps";
import type { Activity, GpsPoint, PlannedWorkout } from "@/lib/types";

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

/** Calcola e salva best_efforts e pace_check di un'attività. */
export async function persistDerived(
  supabase: SupabaseClient,
  userId: string,
  activity: DerivedActivity,
  gps: GpsPoint[] | null | undefined,
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

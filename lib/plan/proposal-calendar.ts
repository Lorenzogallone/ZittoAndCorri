import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, romeDay } from "@/lib/local-date";
import { planProposalDiff, type PlanDayWorkout } from "@/lib/plan/proposal-diff";

/**
 * Confronta una proposta con il calendario reale e con le corse già fatte:
 * restano solo le sedute che cambiano e i giorni da svuotare richiesti, mai
 * giorni passati, già corsi o completati.
 */
export async function diffAgainstCalendar<W extends PlanDayWorkout>(
  supabase: SupabaseClient,
  userId: string,
  start: string,
  end: string,
  proposed: W[],
  removeDates: string[],
) {
  const [{ data: existing, error: planError }, { data: runs, error: runsError }] = await Promise.all([
    supabase
      .from("planned_workouts")
      .select("date, type, status, target_distance_m, target_duration_s, target_pace_s_km, target_hr_bpm, workout_steps")
      .eq("user_id", userId)
      .gte("date", addDays(start, -1))
      .lte("date", end)
      .returns<PlanDayWorkout[]>(),
    supabase
      .from("activities")
      .select("started_at")
      .eq("user_id", userId)
      .eq("sport", "running")
      .gte("started_at", `${addDays(start, -2)}T00:00:00Z`)
      .returns<Array<{ started_at: string }>>(),
  ]);
  if (planError ?? runsError) throw planError ?? runsError;
  return planProposalDiff({
    today: start,
    windowEnd: end,
    existing: existing ?? [],
    activityDates: new Set((runs ?? []).map((run) => romeDay(run.started_at))),
    proposed,
    removeDates,
  });
}

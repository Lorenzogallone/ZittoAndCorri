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
  /** Quanti giorni indietro una seduta non corsa si può ancora togliere. */
  removeLookbackDays = 0,
) {
  const removeFrom = addDays(start, -removeLookbackDays);
  const [{ data: existing, error: planError }, { data: runs, error: runsError }] = await Promise.all([
    supabase
      .from("planned_workouts")
      // "*": ordine, momento e legame delle sedute esistono solo dalla migrazione 0029.
      .select("*")
      .eq("user_id", userId)
      .gte("date", addDays(removeFrom, -1))
      .lte("date", end)
      .returns<PlanDayWorkout[]>(),
    supabase
      .from("activities")
      .select("started_at")
      .eq("user_id", userId)
      .eq("sport", "running")
      .gte("started_at", `${addDays(removeFrom, -2)}T00:00:00Z`)
      .is("excluded_at", null)
      .returns<Array<{ started_at: string }>>(),
  ]);
  if (planError ?? runsError) throw planError ?? runsError;
  return planProposalDiff({
    today: start,
    windowEnd: end,
    removeFrom,
    existing: existing ?? [],
    activityDates: new Set((runs ?? []).map((run) => romeDay(run.started_at))),
    proposed,
    removeDates,
  });
}

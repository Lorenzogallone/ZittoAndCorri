import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, romeDay } from "@/lib/local-date";
import { planProposalDiff, type PlanDayWorkout } from "@/lib/plan/proposal-diff";

/**
 * Compares a proposal with the real calendar and the runs already done:
 * only the sessions that change and the requested days to clear remain, never
 * past, already-run or completed days.
 */
export async function diffAgainstCalendar<W extends PlanDayWorkout>(
  supabase: SupabaseClient,
  userId: string,
  start: string,
  end: string,
  proposed: W[],
  removeDates: string[],
    /** How many days back an unrun session can still be removed. */
  removeLookbackDays = 0,
) {
  const removeFrom = addDays(start, -removeLookbackDays);
  const [{ data: existing, error: planError }, { data: runs, error: runsError }] = await Promise.all([
    supabase
      .from("planned_workouts")
            // "*": order, time of day and link of sessions exist only since migration 0029.
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

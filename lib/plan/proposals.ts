import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Saves a proposal with a snapshot of the sessions of the days it touches: if
 * the plan for those days changes in the meantime, apply_plan_proposal_v2 marks it
 * as superseded instead of overwriting more recent changes.
 */
export async function insertPlanProposal(
  supabase: SupabaseClient,
  input: {
    userId: string;
    summary: string;
        /** Days modified by the proposal (new sessions + days to clear). */
    touched: string[];
    workouts: unknown[];
    removeDates: string[];
    changes: unknown;
    sourceMessageId: string | null;
  },
): Promise<string> {
  const { data: base } = await supabase
    .from("planned_workouts")
    .select("id, updated_at")
    .eq("user_id", input.userId)
    .in("status", ["planned", "skipped"])
    .in("date", input.touched)
    .order("id")
    .returns<Array<{ id: string; updated_at: string }>>();
  const rows = base ?? [];
  const latest = rows.reduce<string | null>(
    (value, row) => !value || row.updated_at > value ? row.updated_at : value,
    null,
  );
  const row = {
    user_id: input.userId,
    source_message_id: input.sourceMessageId,
    summary: input.summary,
    range_start: input.touched[0],
    range_end: input.touched[input.touched.length - 1],
    workouts: input.workouts,
    base_workout_ids: rows.map((r) => r.id).sort(),
    base_latest_updated_at: latest,
  };
  let result = await supabase
    .from("plan_proposals")
    .insert({ ...row, remove_dates: input.removeDates, changes: input.changes })
    .select("id")
    .single<{ id: string }>();
    // Database without migration 0023: the proposal is saved anyway (applying it
    // will ask for the update), so the chat keeps working.
  if (result.error?.code === "42703" || result.error?.code === "PGRST204") {
    result = await supabase.from("plan_proposals").insert(row).select("id").single<{ id: string }>();
  }
  if (result.error || !result.data) throw result.error ?? new Error("Proposta non salvata");
  return result.data.id;
}

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Salva una proposta di piano con la fotografia delle sedute che andrà a
 * sostituire: se nel frattempo il piano cambia, apply_plan_proposal la marca
 * come superata invece di sovrascrivere modifiche più recenti.
 */
export async function insertPlanProposal(
  supabase: SupabaseClient,
  input: {
    userId: string;
    summary: string;
    rangeStart: string;
    rangeEnd: string;
    workouts: unknown[];
    sourceMessageId: string | null;
  },
): Promise<string> {
  const { data: base } = await supabase
    .from("planned_workouts")
    .select("id, updated_at")
    .eq("user_id", input.userId)
    .in("status", ["planned", "skipped"])
    .gte("date", input.rangeStart)
    .lte("date", input.rangeEnd)
    .order("id")
    .returns<Array<{ id: string; updated_at: string }>>();
  const rows = base ?? [];
  const latest = rows.reduce<string | null>(
    (value, row) => !value || row.updated_at > value ? row.updated_at : value,
    null,
  );
  const { data: proposal, error } = await supabase
    .from("plan_proposals")
    .insert({
      user_id: input.userId,
      source_message_id: input.sourceMessageId,
      summary: input.summary,
      range_start: input.rangeStart,
      range_end: input.rangeEnd,
      workouts: input.workouts,
      base_workout_ids: rows.map((row) => row.id).sort(),
      base_latest_updated_at: latest,
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !proposal) throw error ?? new Error("Proposta non salvata");
  return proposal.id;
}

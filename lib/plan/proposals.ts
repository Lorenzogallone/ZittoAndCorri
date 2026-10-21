import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Salva una proposta con la fotografia delle sedute dei giorni che tocca: se nel
 * frattempo il piano di quei giorni cambia, apply_plan_proposal_v2 la marca
 * come superata invece di sovrascrivere modifiche più recenti.
 */
export async function insertPlanProposal(
  supabase: SupabaseClient,
  input: {
    userId: string;
    summary: string;
    /** Giorni modificati dalla proposta (nuove sedute + giorni da svuotare). */
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
  // Database senza migrazione 0023: la proposta si salva comunque (applicarla
  // chiederà l'aggiornamento), così la chat continua a funzionare.
  if (result.error?.code === "42703" || result.error?.code === "PGRST204") {
    result = await supabase.from("plan_proposals").insert(row).select("id").single<{ id: string }>();
  }
  if (result.error || !result.data) throw result.error ?? new Error("Proposta non salvata");
  return result.data.id;
}

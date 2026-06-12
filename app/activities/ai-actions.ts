"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { buildAthleteContext, activityDetailLine } from "@/lib/ai/context";
import { buildEvaluationPrompt, evaluationSchema } from "@/lib/ai/prompt";
import { generateStructured, PRIMARY_MODEL } from "@/lib/ai/gemini";
import { formatDistance, formatDuration, formatPace } from "@/lib/format";
import { TYPE_LABELS } from "@/lib/activity-meta";
import type { Activity, EvaluationResult, PlannedWorkout } from "@/lib/types";

export interface EvaluationActionState {
  error?: string;
}

type EvalActivity = Pick<
  Activity,
  | "id"
  | "user_id"
  | "started_at"
  | "type"
  | "sport"
  | "distance_m"
  | "duration_s"
  | "avg_pace_s_km"
  | "avg_hr"
  | "max_hr"
  | "rpe"
  | "elevation_gain_m"
  | "notes"
>;

type EvalPlanned = Pick<
  PlannedWorkout,
  | "type"
  | "date"
  | "target_distance_m"
  | "target_pace_s_km"
  | "target_duration_s"
  | "description"
>;

/** Riga compatta del workout previsto, per il prompt di valutazione. */
function plannedWorkoutLine(w: EvalPlanned): string {
  const parts = [
    TYPE_LABELS[w.type] ?? w.type,
    w.target_distance_m ? formatDistance(w.target_distance_m) : null,
    w.target_pace_s_km ? `@${formatPace(w.target_pace_s_km)}` : null,
    w.target_duration_s ? formatDuration(w.target_duration_s) : null,
  ].filter(Boolean);
  let line = parts.join(" ");
  if (w.description) line += ` — "${w.description}"`;
  return line;
}

/**
 * Trova il workout pianificato pertinente per la valutazione: prima quello
 * esplicitamente collegato all'attività, altrimenti quello in calendario lo
 * stesso giorno.
 */
async function findPlannedForActivity(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  activityId: string,
  startedAt: string,
): Promise<EvalPlanned | null> {
  const select =
    "type, date, target_distance_m, target_pace_s_km, target_duration_s, description";

  const { data: linked } = await supabase
    .from("planned_workouts")
    .select(select)
    .eq("user_id", userId)
    .eq("activity_id", activityId)
    .maybeSingle<EvalPlanned>();
  if (linked) return linked;

  const day = startedAt.slice(0, 10);
  const { data: sameDay } = await supabase
    .from("planned_workouts")
    .select(select)
    .eq("user_id", userId)
    .eq("date", day)
    .limit(1)
    .maybeSingle<EvalPlanned>();
  return sameDay ?? null;
}

/**
 * Valuta una corsa con Gemini (bottone manuale). Le note inserite dall'utente
 * vengono prima salvate e poi passate al prompt. Tiene una sola valutazione
 * corrente per corsa.
 */
export async function evaluateActivity(
  _prevState: EvaluationActionState,
  formData: FormData,
): Promise<EvaluationActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const activityId = String(formData.get("activity_id") ?? "").trim();
  if (!activityId) return { error: "Corsa non valida." };

  const notesRaw = formData.get("notes");
  const notes =
    typeof notesRaw === "string" && notesRaw.trim() !== ""
      ? notesRaw.trim()
      : null;

  // Salva le note aggiornate (RLS limita all'utente proprietario).
  const { error: updateError } = await supabase
    .from("activities")
    .update({ notes })
    .eq("id", activityId)
    .eq("user_id", user.id);
  if (updateError) return { error: updateError.message };

  const { data: activity } = await supabase
    .from("activities")
    .select(
      "id, user_id, started_at, type, sport, distance_m, duration_s, avg_pace_s_km, avg_hr, max_hr, rpe, elevation_gain_m, notes",
    )
    .eq("id", activityId)
    .eq("user_id", user.id)
    .maybeSingle<EvalActivity>();
  if (!activity) return { error: "Corsa non trovata." };

  let result: EvaluationResult;
  try {
    const [context, planned] = await Promise.all([
      buildAthleteContext(supabase, user.id),
      findPlannedForActivity(supabase, user.id, activityId, activity.started_at),
    ]);
    const prompt = buildEvaluationPrompt(
      context.markdown,
      activityDetailLine(activity),
      planned ? plannedWorkoutLine(planned) : null,
    );
    result = await generateStructured<EvaluationResult>(prompt, evaluationSchema);
  } catch (err) {
    console.error("evaluateActivity:", err);
    return {
      error:
        "Valutazione AI non riuscita (riprova più tardi o controlla la quota Gemini).",
    };
  }

  // Una sola valutazione corrente per corsa: rimuovi le precedenti.
  await supabase
    .from("evaluations")
    .delete()
    .eq("activity_id", activityId)
    .eq("user_id", user.id);

  const { error: insertError } = await supabase.from("evaluations").insert({
    user_id: user.id,
    activity_id: activityId,
    model: PRIMARY_MODEL,
    summary: result.summary,
    flags: result.flags ?? {},
  });
  if (insertError) return { error: insertError.message };

  revalidatePath(`/activities/${activityId}`);
  return {};
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { buildAthleteContext, activityDetailLine } from "@/lib/ai/context";
import { buildEvaluationPrompt, evaluationSchema } from "@/lib/ai/prompt";
import { generateStructured, PRIMARY_MODEL } from "@/lib/ai/gemini";
import type { Activity, EvaluationResult } from "@/lib/types";

export interface EvaluationActionState {
  error?: string;
}

type EvalActivity = Pick<
  Activity,
  | "id"
  | "user_id"
  | "started_at"
  | "type"
  | "distance_m"
  | "duration_s"
  | "avg_pace_s_km"
  | "avg_hr"
  | "max_hr"
  | "rpe"
  | "elevation_gain_m"
  | "notes"
>;

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
      "id, user_id, started_at, type, distance_m, duration_s, avg_pace_s_km, avg_hr, max_hr, rpe, elevation_gain_m, notes",
    )
    .eq("id", activityId)
    .eq("user_id", user.id)
    .maybeSingle<EvalActivity>();
  if (!activity) return { error: "Corsa non trovata." };

  let result: EvaluationResult;
  try {
    const context = await buildAthleteContext(supabase, user.id);
    const prompt = buildEvaluationPrompt(
      context.markdown,
      activityDetailLine(activity),
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

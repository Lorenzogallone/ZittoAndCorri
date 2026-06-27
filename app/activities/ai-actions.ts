"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { buildAthleteContext, activityDetailLine } from "@/lib/ai/context";
import { buildEvaluationPrompt, evaluationSchema } from "@/lib/ai/prompt";
import { generateStructured, aiErrorMessage, PRIMARY_MODEL } from "@/lib/ai/gemini";
import { formatDistance, formatDuration, formatPace } from "@/lib/format";
import { TYPE_LABELS } from "@/lib/activity-meta";
import type { Activity, EvaluationResult, PlannedWorkout } from "@/lib/types";

export interface EvaluationActionState {
  error?: string;
  /** Id del job AI in background da interrogare in polling lato client. */
  jobId?: string;
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
function plannedWorkoutLine(w: EvalPlanned, activityDay: string): string {
  const parts = [
    TYPE_LABELS[w.type] ?? w.type,
    w.target_distance_m ? formatDistance(w.target_distance_m) : null,
    w.target_pace_s_km ? `@${formatPace(w.target_pace_s_km)}` : null,
    w.target_duration_s ? formatDuration(w.target_duration_s) : null,
  ].filter(Boolean);
  let line = parts.join(" ");
  if (w.description) line += ` — "${w.description}"`;
  if (w.date !== activityDay) line += ` (previsto il ${w.date}, collegato manualmente)`;
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

/** Marca un job AI come fallito con un messaggio mostrabile all'utente. */
async function failJob(
  supabase: Awaited<ReturnType<typeof createClient>>,
  jobId: string,
  message: string,
): Promise<void> {
  await supabase
    .from("ai_jobs")
    .update({ status: "error", error: message, updated_at: new Date().toISOString() })
    .eq("id", jobId);
}

/**
 * Valuta una corsa con Gemini (bottone manuale). Le note inserite dall'utente
 * vengono salvate subito; la chiamata AI (lenta) gira in background via
 * `after()` e aggiorna `ai_jobs`. Il client fa polling dello stato, così non
 * resta una connessione lunga aperta → niente reload/crash della PWA su mobile.
 * Tiene una sola valutazione corrente per corsa.
 */
export async function startEvaluation(
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

  // Verifica subito che la corsa esista (errore immediato, prima del job).
  const { data: activity } = await supabase
    .from("activities")
    .select("id")
    .eq("id", activityId)
    .eq("user_id", user.id)
    .maybeSingle<{ id: string }>();
  if (!activity) return { error: "Corsa non trovata." };

  const { data: job, error: jobError } = await supabase
    .from("ai_jobs")
    .insert({ user_id: user.id, kind: "evaluation", ref_id: activityId, status: "pending" })
    .select("id")
    .single<{ id: string }>();
  if (jobError || !job) {
    return { error: "Impossibile avviare la valutazione. Riprova." };
  }

  const userId = user.id;
  after(() => runEvaluation(job.id, userId, activityId));

  return { jobId: job.id };
}

/** Lavoro pesante della valutazione, eseguito dopo la risposta (Next `after()`). */
async function runEvaluation(
  jobId: string,
  userId: string,
  activityId: string,
): Promise<void> {
  const supabase = await createClient();

  const { data: activity } = await supabase
    .from("activities")
    .select(
      "id, user_id, started_at, type, sport, distance_m, duration_s, avg_pace_s_km, avg_hr, max_hr, rpe, elevation_gain_m, notes",
    )
    .eq("id", activityId)
    .eq("user_id", userId)
    .maybeSingle<EvalActivity>();
  if (!activity) {
    await failJob(supabase, jobId, "Corsa non trovata.");
    return;
  }

  let result: EvaluationResult;
  try {
    const [context, planned] = await Promise.all([
      buildAthleteContext(supabase, userId),
      findPlannedForActivity(supabase, userId, activityId, activity.started_at),
    ]);
    const prompt = buildEvaluationPrompt(
      context.markdown,
      activityDetailLine(activity),
      planned ? plannedWorkoutLine(planned, activity.started_at.slice(0, 10)) : null,
    );
    result = await generateStructured<EvaluationResult>(prompt, evaluationSchema);
  } catch (err) {
    console.error("runEvaluation:", err);
    await failJob(supabase, jobId, aiErrorMessage(err));
    return;
  }

  // Una sola valutazione corrente per corsa: rimuovi le precedenti.
  await supabase
    .from("evaluations")
    .delete()
    .eq("activity_id", activityId)
    .eq("user_id", userId);

  const { error: insertError } = await supabase.from("evaluations").insert({
    user_id: userId,
    activity_id: activityId,
    model: PRIMARY_MODEL,
    summary: result.summary,
    flags: result.flags ?? {},
  });
  if (insertError) {
    await failJob(supabase, jobId, insertError.message);
    return;
  }

  revalidatePath(`/activities/${activityId}`);
  await supabase
    .from("ai_jobs")
    .update({ status: "done", updated_at: new Date().toISOString() })
    .eq("id", jobId);
}

"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect, RedirectType } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseDuration } from "@/lib/format";
import { buildAthleteContext } from "@/lib/ai/context";
import { buildPlanPrompt, planSchema } from "@/lib/ai/prompt";
import { generateStructured, aiErrorMessage, PRIMARY_MODEL } from "@/lib/ai/gemini";
import {
  WORKOUT_TYPES,
  type PlannedStatus,
  type PlanGenerationResult,
  type ProposedWorkout,
  type WorkoutType,
} from "@/lib/types";

export interface WorkoutFormState {
  error?: string;
}

export interface GeneratePlanState {
  error?: string;
  /** Id del job AI in background da interrogare in polling lato client. */
  jobId?: string;
}

function optDuration(formData: FormData, key: string): number | null {
  const raw = formData.get(key);
  if (typeof raw !== "string" || raw.trim() === "") return null;
  return parseDuration(raw);
}

function optFloat(formData: FormData, key: string): number | null {
  const raw = formData.get(key);
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export async function createPlannedWorkout(
  _prevState: WorkoutFormState,
  formData: FormData,
): Promise<WorkoutFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const date = String(formData.get("date") ?? "").trim();
  if (!date) return { error: "Inserisci la data." };

  const type = String(formData.get("type") ?? "").trim();
  if (!type) return { error: "Seleziona il tipo." };

  const goal_id = String(formData.get("goal_id") ?? "").trim().replace(/^none$/, "") || null;

  const distKm = optFloat(formData, "target_distance_km");
  const target_distance_m = distKm != null ? Math.round(distKm * 1000) : null;

  const paceRaw = String(formData.get("target_pace") ?? "").trim();
  let target_pace_s_km: number | null = null;
  if (paceRaw) {
    target_pace_s_km = parseDuration(paceRaw);
    if (target_pace_s_km == null)
      return { error: "Passo target non valido (usa mm:ss)." };
  }

  const target_duration_s = optDuration(formData, "target_duration");
  const description = String(formData.get("description") ?? "").trim() || null;

  const hrRaw = optFloat(formData, "target_hr_bpm");
  const target_hr_bpm =
    hrRaw != null && hrRaw >= 80 && hrRaw <= 220 ? Math.round(hrRaw) : null;
  const focus = String(formData.get("focus") ?? "").trim() || null;

  const { error } = await supabase.from("planned_workouts").insert({
    user_id: user.id,
    date,
    type,
    goal_id,
    target_distance_m,
    target_pace_s_km,
    target_duration_s,
    target_hr_bpm,
    description,
    focus,
    status: "planned",
  });

  if (error) return { error: error.message };

  revalidatePath("/plan");
  redirect("/plan", RedirectType.replace);
}

export async function updateWorkoutStatus(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "") as PlannedStatus;
  const validStatuses: PlannedStatus[] = ["planned", "completed"];
  if (!id || !validStatuses.includes(status)) return;

  await supabase
    .from("planned_workouts")
    .update({ status })
    .eq("id", id)
    .eq("user_id", user.id);

  revalidatePath("/plan");
}

export async function linkActivityToWorkout(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const workoutId = String(formData.get("workout_id") ?? "");
  const activityId = String(formData.get("activity_id") ?? "");
  if (!workoutId || !activityId) return;

  await supabase
    .from("planned_workouts")
    .update({ activity_id: activityId, status: "completed" })
    .eq("id", workoutId)
    .eq("user_id", user.id);

  revalidatePath("/plan");
  revalidatePath("/activities");
}

export async function unlinkActivityFromWorkout(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const workoutId = String(formData.get("workout_id") ?? "");
  if (!workoutId) return;

  await supabase
    .from("planned_workouts")
    .update({ activity_id: null, status: "planned" })
    .eq("id", workoutId)
    .eq("user_id", user.id);

  revalidatePath("/plan");
  revalidatePath("/activities");
}

export async function deletePlannedWorkout(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  // Propaga l'errore del delete: il client (DeleteWorkoutButton) lo intercetta e
  // mostra un feedback, invece di redirezionare come se fosse andato a buon fine.
  const { error } = await supabase
    .from("planned_workouts")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);

  revalidatePath("/plan");
  redirect("/plan", RedirectType.replace);
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Intero positivo o null (clamp deterministico dell'output LLM). */
function posIntOrNull(v: unknown): number | null {
  const n = typeof v === "number" ? Math.round(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Valida e sanifica un workout proposto dall'LLM. Scarta quelli con data fuori
 * finestra o tipo non valido; forza i target a interi positivi/null.
 * PLAN.md §2.1: la struttura la propone l'LLM, i numeri li sanifica il codice.
 */
function sanitizeWorkout(
  w: ProposedWorkout,
  start: string,
  end: string,
  userId: string,
  goalId: string | null,
): Record<string, unknown> | null {
  const date = typeof w.date === "string" ? w.date.slice(0, 10) : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < start || date > end) return null;
  if (!WORKOUT_TYPES.includes(w.type as WorkoutType)) return null;

  // HR target: intero plausibile (80–220 bpm), altrimenti null.
  const hr = posIntOrNull(w.target_hr_bpm);
  const target_hr_bpm = hr != null && hr >= 80 && hr <= 220 ? hr : null;

  return {
    user_id: userId,
    goal_id: goalId,
    date,
    type: w.type,
    target_distance_m: posIntOrNull(w.target_distance_m),
    target_pace_s_km: posIntOrNull(w.target_pace_s_km),
    target_duration_s: posIntOrNull(w.target_duration_s),
    target_hr_bpm,
    description:
      typeof w.description === "string" && w.description.trim() !== ""
        ? w.description.trim()
        : null,
    focus:
      typeof w.focus === "string" && w.focus.trim() !== ""
        ? w.focus.trim()
        : null,
    status: "planned" as PlannedStatus,
  };
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
 * Bottone "Pianifica": review delle ultime 2 settimane + nuovo piano per i
 * prossimi 14 giorni. Sovrascrive solo i workout ancora `planned` e non
 * collegati a una corsa; preserva completati/collegati. PLAN.md §8.
 *
 * Avvia il job e risponde SUBITO con il suo id: il lavoro pesante (chiamata
 * Gemini) gira in background via `after()` e aggiorna `ai_jobs`. Il client fa
 * polling, così non resta nessuna connessione lunga aperta → niente reload/
 * crash della PWA su rete mobile.
 */
export async function startPlanGeneration(
  formData: FormData,
): Promise<GeneratePlanState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const comments = String(formData.get("comments") ?? "").trim() || null;

  const { data: job, error: jobError } = await supabase
    .from("ai_jobs")
    .insert({ user_id: user.id, kind: "plan", status: "pending" })
    .select("id")
    .single<{ id: string }>();
  if (jobError || !job) {
    return { error: "Impossibile avviare la generazione. Riprova." };
  }

  const userId = user.id;
  after(() => runPlanGeneration(job.id, userId, comments));

  return { jobId: job.id };
}

/** Lavoro pesante del piano, eseguito dopo la risposta (Next `after()`). */
async function runPlanGeneration(
  jobId: string,
  userId: string,
  comments: string | null,
): Promise<void> {
  const supabase = await createClient();
  const start = isoDate(new Date());
  const end = isoDate(new Date(Date.now() + 13 * 86_400_000));

  let result: PlanGenerationResult;
  let goalId: string | null = null;
  try {
    const context = await buildAthleteContext(supabase, userId);
    goalId = context.activeGoal?.id ?? null;
    const prompt = buildPlanPrompt(context.markdown, start, end, comments);
    result = await generateStructured<PlanGenerationResult>(prompt, planSchema);
  } catch (err) {
    console.error("runPlanGeneration:", err);
    await failJob(supabase, jobId, aiErrorMessage(err));
    return;
  }

  const rows = (result.workouts ?? [])
    .map((w) => sanitizeWorkout(w, start, end, userId, goalId))
    .filter((r): r is Record<string, unknown> => r !== null);

  if (rows.length === 0) {
    await failJob(
      supabase,
      jobId,
      "L'AI non ha prodotto allenamenti validi per le prossime 2 settimane. Riprova.",
    );
    return;
  }

  // Sovrascrive solo i 'planned' futuri non collegati a una corsa.
  const { error: delError } = await supabase
    .from("planned_workouts")
    .delete()
    .eq("user_id", userId)
    .eq("status", "planned")
    .is("activity_id", null)
    .gte("date", start)
    .lte("date", end);
  if (delError) {
    await failJob(supabase, jobId, delError.message);
    return;
  }

  const { error: insError } = await supabase.from("planned_workouts").insert(rows);
  if (insError) {
    await failJob(supabase, jobId, insError.message);
    return;
  }

  // La review è secondaria: i workout sono già salvati. Se la tabella
  // plan_reviews non esiste ancora (migration da applicare) logga ma non blocca.
  const { error: revError } = await supabase.from("plan_reviews").insert({
    user_id: userId,
    goal_id: goalId,
    range_start: start,
    range_end: end,
    summary: result.review_summary,
    comments,
    model: PRIMARY_MODEL,
  });
  if (revError) console.error("runPlanGeneration/plan_reviews:", revError.message);

  // Memoria coach: la narrativa di fase prodotta dall'LLM viene persistita e
  // rientra in tutti i prompt futuri (continuità della progressione).
  const coachMemory =
    typeof result.coach_memory === "string" ? result.coach_memory.trim() : "";
  if (coachMemory) {
    const { error: memError } = await supabase.from("athlete_snapshot").upsert({
      user_id: userId,
      narrative: { coach_memory: coachMemory },
      updated_at: new Date().toISOString(),
    });
    if (memError)
      console.error("runPlanGeneration/athlete_snapshot:", memError.message);
  }

  revalidatePath("/plan");
  await supabase
    .from("ai_jobs")
    .update({ status: "done", updated_at: new Date().toISOString() })
    .eq("id", jobId);
}

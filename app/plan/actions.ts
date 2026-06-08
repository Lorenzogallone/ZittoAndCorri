"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseDuration } from "@/lib/format";
import { buildAthleteContext } from "@/lib/ai/context";
import { buildPlanPrompt, planSchema } from "@/lib/ai/prompt";
import { generateStructured, PRIMARY_MODEL } from "@/lib/ai/gemini";
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
  ok?: boolean;
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

  const goal_id = String(formData.get("goal_id") ?? "").trim() || null;

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

  const { error } = await supabase.from("planned_workouts").insert({
    user_id: user.id,
    date,
    type,
    goal_id,
    target_distance_m,
    target_pace_s_km,
    target_duration_s,
    description,
    status: "planned",
  });

  if (error) return { error: error.message };

  revalidatePath("/plan");
  redirect("/plan");
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

export async function deletePlannedWorkout(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await supabase
    .from("planned_workouts")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  revalidatePath("/plan");
  redirect("/plan");
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

  return {
    user_id: userId,
    goal_id: goalId,
    date,
    type: w.type,
    target_distance_m: posIntOrNull(w.target_distance_m),
    target_pace_s_km: posIntOrNull(w.target_pace_s_km),
    target_duration_s: posIntOrNull(w.target_duration_s),
    description:
      typeof w.description === "string" && w.description.trim() !== ""
        ? w.description.trim()
        : null,
    status: "planned" as PlannedStatus,
  };
}

/**
 * Bottone "Pianifica": review delle ultime 2 settimane + nuovo piano per i
 * prossimi 14 giorni. Sovrascrive solo i workout ancora `planned` e non
 * collegati a una corsa; preserva completati/collegati. PLAN.md §8.
 */
export async function generatePlan(
  _prevState: GeneratePlanState,
  formData: FormData,
): Promise<GeneratePlanState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const comments = String(formData.get("comments") ?? "").trim() || null;

  const start = isoDate(new Date());
  const end = isoDate(new Date(Date.now() + 13 * 86_400_000));

  let result: PlanGenerationResult;
  let goalId: string | null = null;
  try {
    const context = await buildAthleteContext(supabase, user.id);
    goalId = context.activeGoal?.id ?? null;
    const prompt = buildPlanPrompt(context.markdown, start, end, comments);
    result = await generateStructured<PlanGenerationResult>(prompt, planSchema);
  } catch (err) {
    console.error("generatePlan:", err);
    return {
      error:
        "Generazione del piano non riuscita (riprova più tardi o controlla la quota Gemini).",
    };
  }

  const rows = (result.workouts ?? [])
    .map((w) => sanitizeWorkout(w, start, end, user.id, goalId))
    .filter((r): r is Record<string, unknown> => r !== null);

  if (rows.length === 0) {
    return {
      error:
        "L'AI non ha prodotto allenamenti validi per le prossime 2 settimane. Riprova.",
    };
  }

  // Sovrascrive solo i 'planned' futuri non collegati a una corsa.
  const { error: delError } = await supabase
    .from("planned_workouts")
    .delete()
    .eq("user_id", user.id)
    .eq("status", "planned")
    .is("activity_id", null)
    .gte("date", start)
    .lte("date", end);
  if (delError) return { error: delError.message };

  const { error: insError } = await supabase.from("planned_workouts").insert(rows);
  if (insError) return { error: insError.message };

  // La review è secondaria: i workout sono già salvati. Se la tabella
  // plan_reviews non esiste ancora (migration da applicare) logga ma non blocca.
  const { error: revError } = await supabase.from("plan_reviews").insert({
    user_id: user.id,
    goal_id: goalId,
    range_start: start,
    range_end: end,
    summary: result.review_summary,
    comments,
    model: PRIMARY_MODEL,
  });
  if (revError) console.error("generatePlan/plan_reviews:", revError.message);

  revalidatePath("/plan");
  return { ok: true };
}

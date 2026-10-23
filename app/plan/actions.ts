"use server";

import { revalidatePath } from "next/cache";
import { schedulePlanPublish } from "@/lib/intervals/sync";
import { redirect, RedirectType } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseDuration } from "@/lib/format";
import type { CoachMemoryCategory, Goal, PlannedStatus, PlannedWorkout, Profile } from "@/lib/types";
import { legacyWorkoutStep, workoutStepsOrLegacy } from "@/lib/workout-steps";
import { addDays, romeDay } from "@/lib/local-date";
import { ADAPT_DURATIONS, ADAPT_REASONS, adaptWorkout, originalFields, type AdaptReason } from "@/lib/plan/adapt";
import { recoveryWorkouts } from "@/lib/plan/recovery";
import { insertPlanProposal } from "@/lib/plan/proposals";
import { diffAgainstCalendar } from "@/lib/plan/proposal-calendar";
import { hrZones } from "@/lib/metrics/zones";
import { getEffectiveHrConfig } from "@/lib/zepp/effective-hr";

export interface WorkoutFormState { error?: string }

function optDuration(formData: FormData, key: string): number | null {
  const raw = formData.get(key);
  if (typeof raw !== "string" || raw.trim() === "") return null;
  return parseDuration(raw);
}

function optFloat(formData: FormData, key: string): number | null {
  const raw = formData.get(key);
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export async function createPlannedWorkout(
  _state: WorkoutFormState,
  formData: FormData,
): Promise<WorkoutFormState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const date = String(formData.get("date") ?? "").trim();
  const type = String(formData.get("type") ?? "").trim();
  if (!date) return { error: "Inserisci la data." };
  if (!type) return { error: "Seleziona il tipo." };
  const distanceKm = optFloat(formData, "target_distance_km");
  const paceRaw = String(formData.get("target_pace") ?? "").trim();
  const pace = paceRaw ? parseDuration(paceRaw) : null;
  if (paceRaw && pace == null) return { error: "Passo target non valido (usa mm:ss)." };
  const hrRaw = optFloat(formData, "target_hr_bpm");
  const targetDistance = distanceKm == null ? null : Math.round(distanceKm * 1000);
  const targetDuration = optDuration(formData, "target_duration");
  const targetHr = hrRaw != null && hrRaw >= 80 && hrRaw <= 220 ? Math.round(hrRaw) : null;
  const { error } = await supabase.from("planned_workouts").insert({
    user_id: user.id,
    date,
    type,
    goal_id: String(formData.get("goal_id") ?? "").trim().replace(/^none$/, "") || null,
    target_distance_m: targetDistance,
    target_pace_s_km: pace,
    target_duration_s: targetDuration,
    target_hr_bpm: targetHr,
    workout_steps: legacyWorkoutStep({
      type,
      target_distance_m: targetDistance,
      target_duration_s: targetDuration,
      target_pace_s_km: pace,
      target_hr_bpm: targetHr,
    }),
    description: String(formData.get("description") ?? "").trim() || null,
    focus: String(formData.get("focus") ?? "").trim() || null,
    status: "planned",
    origin: "user",
  });
  if (error) return { error: error.message };
  schedulePlanPublish(user.id);
  revalidatePath("/plan");
  redirect("/plan", RedirectType.replace);
}

export async function updateWorkoutStatus(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "") as PlannedStatus;
  if (!id || !(["planned", "completed"] as PlannedStatus[]).includes(status)) return;
  await supabase.from("planned_workouts").update({ status }).eq("id", id).eq("user_id", user.id);
  revalidatePlan(user.id);
}

export async function deletePlannedWorkout(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const { error } = await supabase.from("planned_workouts").delete().eq("id", id).eq("user_id", user.id);
  if (error) throw new Error(error.message);
  schedulePlanPublish(user.id);
  revalidatePath("/plan");
  redirect("/plan", RedirectType.replace);
}

function revalidatePlan(userId: string) {
  schedulePlanPublish(userId);
  revalidatePath("/plan", "layout");
  revalidatePath("/");
}

/** Sposta una seduta su un altro giorno (da oggi in avanti). */
export async function moveWorkout(id: string, date: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < romeDay() || date > addDays(romeDay(), 60)) {
    return { error: "Data non valida." };
  }
  const { error } = await supabase
    .from("planned_workouts")
    .update({ date })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: "Impossibile spostare la seduta." };
  revalidatePlan(user.id);
  return {};
}

const ADAPT_MEMORY: Record<AdaptReason, { category: CoachMemoryCategory; text: string }> = {
  tired: { category: "fatigue", text: "L'atleta si sente stanco: sedute alleggerite" },
  busy: { category: "availability", text: "L'atleta ha poco tempo: sedute accorciate" },
  sick: { category: "limitation", text: "L'atleta è malato o ha un fastidio: sedute in pausa" },
};

/** "Non mi sento al 100%": alleggerisce, accorcia o mette in pausa i prossimi giorni. */
export async function adaptPlan(reason: AdaptReason, days: number): Promise<{ error?: string; count?: number; until?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!(reason in ADAPT_REASONS) || !ADAPT_DURATIONS.some((option) => option.days === days)) {
    return { error: "Scelta non valida." };
  }
  const today = romeDay();
  const until = addDays(today, days - 1);
  const { data: workouts, error } = await supabase
    .from("planned_workouts")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", "planned")
    .is("adapted_from", null)
    .gte("date", today)
    .lte("date", until)
    .returns<PlannedWorkout[]>();
  if (error) return { error: "Impossibile leggere il piano." };

  const memory = ADAPT_MEMORY[reason];
  const { data: savedMemory } = await supabase
    .from("coach_memories")
    .insert({
      user_id: user.id,
      category: memory.category,
      content: `${memory.text} fino al ${until}.`,
      valid_from: today,
      valid_until: until,
      source: "chat",
      confidence: 1,
    })
    .select("id")
    .single<{ id: string }>();

  let count = 0;
  for (const workout of workouts ?? []) {
    const current = { ...workout, workout_steps: workoutStepsOrLegacy(workout.workout_steps, workout) };
    const changes = adaptWorkout(current, reason);
    if (!changes) continue;
    const { error: updateError } = await supabase
      .from("planned_workouts")
      .update({
        ...changes,
        adapted_from: { ...originalFields(current, changes), reason, until, memory_id: savedMemory?.id ?? null },
      })
      .eq("id", workout.id)
      .eq("user_id", user.id);
    if (!updateError) count += 1;
  }
  revalidatePlan(user.id);
  return { count, until };
}

const ADAPT_META_KEYS = new Set(["reason", "until", "memory_id"]);

/** Ripristina le sedute future alleggerite o in pausa. */
export async function undoAdaptation(): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: workouts, error } = await supabase
    .from("planned_workouts")
    .select("id, adapted_from")
    .eq("user_id", user.id)
    .not("adapted_from", "is", null)
    .gte("date", romeDay())
    .returns<Array<Pick<PlannedWorkout, "id" | "adapted_from">>>();
  if (error) return { error: "Impossibile ripristinare il piano." };
  const memories = new Set<string>();
  for (const workout of workouts ?? []) {
    const original = Object.fromEntries(
      Object.entries(workout.adapted_from ?? {}).filter(([key]) => !ADAPT_META_KEYS.has(key)),
    );
    const memoryId = workout.adapted_from?.memory_id;
    if (typeof memoryId === "string") memories.add(memoryId);
    await supabase
      .from("planned_workouts")
      .update({ ...original, adapted_from: null })
      .eq("id", workout.id)
      .eq("user_id", user.id);
  }
  if (memories.size) {
    await supabase.from("coach_memories").update({ is_active: false }).in("id", [...memories]).eq("user_id", user.id);
  }
  revalidatePlan(user.id);
  return {};
}

/**
 * Dopo la gara: propone in chat qualche giorno di recupero, archivia
 * l'obiettivo e attiva il prossimo obiettivo in calendario, se c'è.
 */
export async function planRecovery(): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const today = romeDay();
  const [{ data: goal }, { data: profile }] = await Promise.all([
    supabase
      .from("goals")
      .select("id, race_name, race_date, distance_m")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle<Pick<Goal, "id" | "race_name" | "race_date" | "distance_m">>(),
    supabase.from("profiles").select("max_hr, resting_hr").eq("id", user.id).maybeSingle<Pick<Profile, "max_hr" | "resting_hr">>(),
  ]);
  if (!goal?.race_date || goal.race_date >= today) redirect("/");

  const zones = hrZones(await getEffectiveHrConfig(supabase, user.id, profile ?? null));
  const workouts = recoveryWorkouts({
    race_date: goal.race_date,
    distance_m: goal.distance_m,
    today,
    hr_cap: zones ? zones.lower.z3 : null,
  });

  if (workouts.length) {
    const { data: message } = await supabase
      .from("coach_messages")
      .insert({
        user_id: user.id,
        role: "assistant",
        kind: "plan_proposal",
        content: `Complimenti per la ${goal.race_name}! Prima di ripartire concediti qualche giorno di recupero: uscite brevi e facili per far tornare fresche le gambe. Se ti va bene, conferma qui sotto.`,
        metadata: { type: "post_race_recovery", goal_id: goal.id },
      })
      .select("id")
      .single<{ id: string }>();
    // Dopo la gara il vecchio piano non serve più: le sedute di recupero più
    // lo svuotamento degli altri giorni delle prossime due settimane.
    const end = addDays(today, 13);
    const window = Array.from({ length: 14 }, (_, i) => addDays(today, i));
    const diff = await diffAgainstCalendar(supabase, user.id, today, end, workouts, window);
    if (message && diff.touched.length) {
      const proposalId = await insertPlanProposal(supabase, {
        userId: user.id,
        summary: "Recupero dopo la gara",
        touched: diff.touched,
        workouts: diff.workouts,
        removeDates: diff.removeDates,
        changes: diff.changes,
        sourceMessageId: null,
      });
      await supabase.from("coach_messages").update({ plan_proposal_id: proposalId }).eq("id", message.id);
    }
  }

  await supabase.from("goals").update({ is_active: false }).eq("id", goal.id).eq("user_id", user.id);
  const { data: next } = await supabase
    .from("goals")
    .select("id")
    .eq("user_id", user.id)
    .gte("race_date", today)
    .order("race_date")
    .limit(1)
    .maybeSingle<{ id: string }>();
  if (next) await supabase.from("goals").update({ is_active: true }).eq("id", next.id).eq("user_id", user.id);
  revalidatePlan(user.id);
  redirect("/");
}

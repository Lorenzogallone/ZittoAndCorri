"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseDuration } from "@/lib/format";
import type { PlannedStatus } from "@/lib/types";

export interface WorkoutFormState {
  error?: string;
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
  const validStatuses: PlannedStatus[] = ["planned", "completed", "missed", "skipped"];
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

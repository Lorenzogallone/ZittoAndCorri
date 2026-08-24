"use server";

import { revalidatePath } from "next/cache";
import { redirect, RedirectType } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseDuration } from "@/lib/format";
import type { PlannedStatus } from "@/lib/types";

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
  const { error } = await supabase.from("planned_workouts").insert({
    user_id: user.id,
    date,
    type,
    goal_id: String(formData.get("goal_id") ?? "").trim().replace(/^none$/, "") || null,
    target_distance_m: distanceKm == null ? null : Math.round(distanceKm * 1000),
    target_pace_s_km: pace,
    target_duration_s: optDuration(formData, "target_duration"),
    target_hr_bpm: hrRaw != null && hrRaw >= 80 && hrRaw <= 220 ? Math.round(hrRaw) : null,
    description: String(formData.get("description") ?? "").trim() || null,
    focus: String(formData.get("focus") ?? "").trim() || null,
    status: "planned",
    origin: "user",
  });
  if (error) return { error: error.message };
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
  revalidatePath("/plan");
}

export async function deletePlannedWorkout(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const { error } = await supabase.from("planned_workouts").delete().eq("id", id).eq("user_id", user.id);
  if (error) throw new Error(error.message);
  revalidatePath("/plan");
  redirect("/plan", RedirectType.replace);
}

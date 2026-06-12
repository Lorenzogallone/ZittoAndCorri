"use server";

import { revalidatePath } from "next/cache";
import { redirect, RedirectType } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseDuration } from "@/lib/format";

export interface GoalFormState {
  error?: string;
}

function optDuration(formData: FormData, key: string): number | null {
  const raw = formData.get(key);
  if (typeof raw !== "string" || raw.trim() === "") return null;
  return parseDuration(raw);
}

export async function createGoal(
  _prevState: GoalFormState,
  formData: FormData,
): Promise<GoalFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const race_name = String(formData.get("race_name") ?? "").trim();
  if (!race_name) return { error: "Inserisci il nome della gara." };

  const distanceKm = Number(formData.get("distance_km"));
  if (!Number.isFinite(distanceKm) || distanceKm <= 0)
    return { error: "Distanza non valida." };

  const raceDateRaw = String(formData.get("race_date") ?? "").trim();
  const race_date = raceDateRaw || null;

  const targetRaw = String(formData.get("target_time") ?? "").trim();
  let target_time_s: number | null = null;
  if (targetRaw) {
    target_time_s = optDuration(formData, "target_time");
    if (target_time_s == null || target_time_s <= 0)
      return { error: "Tempo obiettivo non valido (usa h:mm:ss o mm:ss)." };
  }

  const is_active = formData.get("is_active") === "on";

  if (is_active) {
    await supabase
      .from("goals")
      .update({ is_active: false })
      .eq("user_id", user.id);
  }

  const { error } = await supabase.from("goals").insert({
    user_id: user.id,
    race_name,
    race_date,
    distance_m: Math.round(distanceKm * 1000),
    target_time_s,
    is_active,
  });

  if (error) return { error: error.message };

  revalidatePath("/goals");
  redirect("/goals", RedirectType.replace);
}

export async function updateGoal(
  id: string,
  _prevState: GoalFormState,
  formData: FormData,
): Promise<GoalFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const race_name = String(formData.get("race_name") ?? "").trim();
  if (!race_name) return { error: "Inserisci il nome della gara." };

  const distanceKm = Number(formData.get("distance_km"));
  if (!Number.isFinite(distanceKm) || distanceKm <= 0)
    return { error: "Distanza non valida." };

  const raceDateRaw = String(formData.get("race_date") ?? "").trim();
  const race_date = raceDateRaw || null;

  const targetRaw = String(formData.get("target_time") ?? "").trim();
  let target_time_s: number | null = null;
  if (targetRaw) {
    target_time_s = optDuration(formData, "target_time");
    if (target_time_s == null || target_time_s <= 0)
      return { error: "Tempo obiettivo non valido (usa h:mm:ss o mm:ss)." };
  }

  const is_active = formData.get("is_active") === "on";

  if (is_active) {
    await supabase
      .from("goals")
      .update({ is_active: false })
      .eq("user_id", user.id)
      .neq("id", id);
  }

  const { error } = await supabase
    .from("goals")
    .update({
      race_name,
      race_date,
      distance_m: Math.round(distanceKm * 1000),
      target_time_s,
      is_active,
    })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/goals");
  redirect("/goals", RedirectType.replace);
}

export async function deleteGoal(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await supabase.from("goals").delete().eq("id", id).eq("user_id", user.id);

  revalidatePath("/goals");
  redirect("/goals", RedirectType.replace);
}

export async function setActiveGoal(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await supabase
    .from("goals")
    .update({ is_active: false })
    .eq("user_id", user.id);
  await supabase
    .from("goals")
    .update({ is_active: true })
    .eq("id", id)
    .eq("user_id", user.id);

  revalidatePath("/goals");
}

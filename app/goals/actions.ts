"use server";

import { revalidatePath } from "next/cache";
import { redirect, RedirectType } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { parseDecimal, parseDuration } from "@/lib/format";
import { generalGoalName } from "@/lib/goals";

export interface GoalFormState {
  error?: string;
}

function optDuration(formData: FormData, key: string): number | null {
  const raw = formData.get(key);
  if (typeof raw !== "string" || raw.trim() === "") return null;
  return parseDuration(raw);
}

interface GoalValues {
  race_name: string;
  race_date: string | null;
  distance_m: number;
  target_time_s: number | null;
  is_active: boolean;
}

/**
 * Validates the goal form. With goal_kind "general" no race is needed: the
 * date is ignored and the name, if empty, is generated from the distance.
 */
function parseGoalForm(formData: FormData, t: (key: string) => string): GoalValues | { error: string } {
  const general = formData.get("goal_kind") === "general";

  const distanceKm = parseDecimal(formData.get("distance_km"));
  if (!Number.isFinite(distanceKm) || distanceKm <= 0)
    return { error: t("distance") };
  const distance_m = Math.round(distanceKm * 1000);

  const nameRaw = String(formData.get("race_name") ?? "").trim();
  const race_name = nameRaw || (general ? generalGoalName(distance_m) : "");
  if (!race_name) return { error: t("raceName") };

  const race_date = general ? null : String(formData.get("race_date") ?? "").trim() || null;
  if (!general && !race_date)
    return { error: t("raceDate") };

  const targetRaw = String(formData.get("target_time") ?? "").trim();
  let target_time_s: number | null = null;
  if (targetRaw) {
    target_time_s = optDuration(formData, "target_time");
    if (target_time_s == null || target_time_s <= 0)
      return { error: t("targetTime") };
  }

  return {
    race_name,
    race_date,
    distance_m,
    target_time_s,
    is_active: formData.get("is_active") === "on",
  };
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

  const parsed = parseGoalForm(formData, await getTranslations("goals.errors"));
  if ("error" in parsed) return parsed;
  const { race_name, race_date, distance_m, target_time_s, is_active } = parsed;

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
    distance_m,
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

  const parsed = parseGoalForm(formData, await getTranslations("goals.errors"));
  if ("error" in parsed) return parsed;
  const { race_name, race_date, distance_m, target_time_s, is_active } = parsed;

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
      distance_m,
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

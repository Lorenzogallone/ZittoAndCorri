"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseDuration } from "@/lib/format";
import { verifyGeminiApiKey } from "@/lib/ai/gemini";
import { storeGeminiApiKey } from "@/lib/ai/credentials";

export interface OnboardingState { error?: string }

function optionalInt(formData: FormData, key: string): number | null {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) return null;
  const number = Number(raw);
  return Number.isFinite(number) ? Math.round(number) : null;
}

export async function completeOnboarding(
  _state: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const max_hr = optionalInt(formData, "max_hr");
  const resting_hr = optionalInt(formData, "resting_hr");
  if (max_hr != null && (max_hr < 100 || max_hr > 240)) return { error: "HR max non valida." };
  if (resting_hr != null && (resting_hr < 30 || resting_hr > 120)) return { error: "HR a riposo non valida." };
  if (max_hr != null && resting_hr != null && max_hr <= resting_hr) {
    return { error: "HR max deve superare la frequenza a riposo." };
  }

  const birthdate = String(formData.get("birthdate") ?? "").trim() || null;
  const geminiKey = String(formData.get("gemini_key") ?? "").trim();
  if (geminiKey) {
    try {
      await verifyGeminiApiKey(geminiKey);
      await storeGeminiApiKey(user.id, geminiKey);
    } catch {
      return { error: "La chiave Gemini non è valida. Puoi correggerla o lasciarla vuota." };
    }
  }

  const raceName = String(formData.get("race_name") ?? "").trim();
  const distanceRaw = String(formData.get("distance_km") ?? "").trim();
  if (raceName || distanceRaw) {
    const distanceKm = Number(distanceRaw);
    if (!raceName || !Number.isFinite(distanceKm) || distanceKm <= 0) {
      return { error: "Per l'obiettivo inserisci nome e distanza validi." };
    }
    const targetRaw = String(formData.get("target_time") ?? "").trim();
    const target_time_s = targetRaw ? parseDuration(targetRaw) : null;
    if (targetRaw && !target_time_s) return { error: "Tempo obiettivo non valido." };
    await supabase.from("goals").update({ is_active: false }).eq("user_id", user.id);
    const { error } = await supabase.from("goals").insert({
      user_id: user.id,
      race_name: raceName,
      race_date: String(formData.get("race_date") ?? "").trim() || null,
      distance_m: Math.round(distanceKm * 1000),
      target_time_s,
      is_active: true,
    });
    if (error) return { error: error.message };
  }

  const { error } = await supabase.from("profiles").update({
    max_hr,
    resting_hr,
    birthdate,
    onboarding_completed_at: new Date().toISOString(),
  }).eq("id", user.id);
  if (error) return { error: error.message };
  redirect("/");
}

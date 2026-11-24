"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseDecimal, parseDuration } from "@/lib/format";
import { verifyGeminiApiKey } from "@/lib/ai/gemini";
import { OpenRouterError, verifyOpenRouterKey } from "@/lib/ai/openrouter";
import { setAiProvider, storeGeminiApiKey, storeOpenRouterApiKey } from "@/lib/ai/credentials";
import { generalGoalName } from "@/lib/goals";

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

  // Tutto si valida prima di scrivere: un errore non lascia a metà chiavi o obiettivo.
  const goalKind = String(formData.get("goal_kind") ?? "none");
  let goal: { distance_m: number; race_name: string; race_date: string | null; target_time_s: number | null } | null = null;
  if (goalKind === "race" || goalKind === "improve") {
    const distanceKm = parseDecimal(String(formData.get("distance_km") ?? "").trim());
    if (!Number.isFinite(distanceKm) || distanceKm <= 0) return { error: "Per l'obiettivo scegli una distanza valida." };
    const distance_m = Math.round(distanceKm * 1000);
    const targetRaw = String(formData.get("target_time") ?? "").trim();
    const target_time_s = targetRaw ? parseDuration(targetRaw) : null;
    if (targetRaw && !target_time_s) return { error: "Tempo obiettivo non valido." };
    if (goalKind === "race") {
      const race_date = String(formData.get("race_date") ?? "").trim();
      if (!race_date) return { error: "Per una gara serve la data." };
      const race_name = String(formData.get("race_name") ?? "").trim();
      goal = { distance_m, race_name: race_name || generalGoalName(distance_m), race_date, target_time_s };
    } else {
      // Senza data è un obiettivo generico (es. migliorare nella mezza).
      goal = { distance_m, race_name: generalGoalName(distance_m), race_date: null, target_time_s };
    }
  }

  const provider = String(formData.get("ai_provider") ?? "gemini") === "openrouter" ? "openrouter" : "gemini";
  const geminiKey = String(formData.get("gemini_key") ?? "").trim();
  const openRouterKey = String(formData.get("openrouter_key") ?? "").trim();
  const openRouterModel = String(formData.get("openrouter_model") ?? "").trim();
  if (provider === "openrouter" && openRouterKey) {
    if (openRouterKey.length < 16) return { error: "La chiave OpenRouter non sembra valida." };
    if (!/^[a-z0-9][\w.-]*\/[\w.:-]+$/i.test(openRouterModel) || openRouterModel.length > 120) {
      return { error: "Scegli un modello OpenRouter, es. anthropic/claude-sonnet." };
    }
  }

  if (provider === "gemini" && geminiKey) {
    try {
      await verifyGeminiApiKey(geminiKey);
      await storeGeminiApiKey(user.id, geminiKey);
    } catch {
      return { error: "La chiave Gemini non è valida. Puoi correggerla o lasciarla vuota." };
    }
  }
  if (provider === "openrouter" && openRouterKey) {
    try {
      await verifyOpenRouterKey(openRouterKey);
    } catch (error) {
      console.error("completeOnboarding openrouter verify:", error instanceof Error ? error.message : error);
      return { error: error instanceof OpenRouterError && error.status === 401 ? "La chiave OpenRouter non è valida. Puoi correggerla o lasciarla vuota." : "Non riesco a verificare la chiave con OpenRouter. Riprova o lasciala vuota." };
    }
    try {
      await storeOpenRouterApiKey(user.id, openRouterKey, openRouterModel);
      await setAiProvider(user.id, "openrouter");
    } catch (error) {
      console.error("completeOnboarding openrouter store:", error instanceof Error ? error.message : error);
      const code = (error as { code?: string } | null)?.code;
      const notMigrated = code === "PGRST202" || code === "42P01" || code === "PGRST205" || code === "42703";
      return { error: notMigrated ? "Per usare OpenRouter serve aggiornare il database (migrazione 0023). Puoi usare Gemini o saltare." : "Impossibile salvare la chiave OpenRouter. Riprova o usa Gemini." };
    }
  }

  if (goal) {
    await supabase.from("goals").update({ is_active: false }).eq("user_id", user.id);
    const { error } = await supabase.from("goals").insert({ user_id: user.id, ...goal, is_active: true });
    if (error) return { error: error.message };
  }

  const { error } = await supabase.from("profiles").update({
    max_hr,
    resting_hr,
    birthdate,
    onboarding_completed_at: new Date().toISOString(),
  }).eq("id", user.id);
  if (error) return { error: error.message };
  // «Collega ora»: l'ultimo passo porta alle impostazioni dei collegamenti.
  redirect(formData.get("after") === "links" ? "/settings?tab=links" : "/");
}

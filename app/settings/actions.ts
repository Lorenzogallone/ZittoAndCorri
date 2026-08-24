"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { sanitizePrefs, type ThemePrefs } from "@/lib/theme";
import crypto from "crypto";
import { verifyGeminiApiKey } from "@/lib/ai/gemini";
import { removeGeminiApiKey, setGeminiModel, storeGeminiApiKey } from "@/lib/ai/credentials";
import { isGeminiModelId } from "@/lib/ai/models";

export interface ProfileFormState {
  error?: string;
  ok?: boolean;
}

function optInt(formData: FormData, key: string): number | null {
  const raw = formData.get(key);
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n) : null;
}

export async function updateProfile(
  _prevState: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const max_hr = optInt(formData, "max_hr");
  const resting_hr = optInt(formData, "resting_hr");
  const birthdateRaw = String(formData.get("birthdate") ?? "").trim();
  const birthdate = birthdateRaw || null;

  if (max_hr != null && resting_hr != null && max_hr <= resting_hr) {
    return { error: "HR max deve essere maggiore della HR a riposo." };
  }

  const { error } = await supabase
    .from("profiles")
    .upsert(
      { id: user.id, max_hr, resting_hr, birthdate },
      { onConflict: "id" },
    );

  if (error) return { error: error.message };

  revalidatePath("/settings");
  revalidatePath("/profile");
  return { ok: true };
}

/**
 * Persiste le preferenze tema sul profilo (sincronizzazione cross-device).
 * I valori vengono sanificati lato server. Best-effort: l'applicazione live del
 * tema è già avvenuta sul client, qui garantiamo solo la durabilità. Tollerante
 * se la migration 0005 non è ancora stata applicata (logga e non blocca). */
export async function updateThemePrefs(
  input: { mode?: string; accent?: string; style?: string },
): Promise<{ error?: string; ok?: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const prefs: ThemePrefs = sanitizePrefs(input);

  const { error } = await supabase
    .from("profiles")
    .upsert(
      {
        id: user.id,
        theme_mode: prefs.mode,
        theme_accent: prefs.accent,
        theme_style: prefs.style,
      },
      { onConflict: "id" },
    );

  if (error) {
    console.error("updateThemePrefs:", error.message);
    return { error: error.message };
  }

  // NB: niente revalidatePath qui. Il tema è già applicato live sul client
  // (applyThemePrefs) e qui lo rendiamo solo durevole; rivalidare il ROOT layout
  // costringerebbe Next a un reload completo del documento — in PWA standalone
  // si vede come l'app che si ricarica (a volte restando bloccata sullo splash).
  // Il seed aggiornato dal DB viene comunque letto al prossimo caricamento.
  return { ok: true };
}

export async function regenerateApiKey(): Promise<{ error?: string; ok?: boolean; key?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const newKey = crypto.randomUUID();

  const { error } = await supabase
    .from("profiles")
    .update({ api_key: newKey })
    .eq("id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/settings");
  return { ok: true, key: newKey };
}

export async function saveGeminiApiKey(
  apiKey: string,
): Promise<{ error?: string; ok?: boolean }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const key = apiKey.trim();
  if (key.length < 16) return { error: "La chiave Gemini non sembra valida." };

  try {
    await verifyGeminiApiKey(key);
    await storeGeminiApiKey(user.id, key);
  } catch (error) {
    console.error("saveGeminiApiKey:", error instanceof Error ? error.message : error);
    return { error: "Chiave non valida o non autorizzata per Gemini." };
  }
  return { ok: true };
}

export async function deleteGeminiApiKey(): Promise<{ error?: string; ok?: boolean }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  try {
    await removeGeminiApiKey(user.id);
  } catch (error) {
    console.error("deleteGeminiApiKey:", error instanceof Error ? error.message : error);
    return { error: "Impossibile rimuovere la chiave. Riprova." };
  }
  return { ok: true };
}

export async function saveGeminiModel(model: string): Promise<{ error?: string; ok?: boolean }> {
  if (!isGeminiModelId(model)) return { error: "Modello Gemini non supportato." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  try {
    const { data: credential, error } = await supabase
      .from("user_ai_credentials")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle<{ user_id: string }>();
    if (error) throw error;
    if (!credential) return { error: "Configura prima la chiave Gemini." };
    await setGeminiModel(user.id, model);
  } catch (error) {
    console.error("saveGeminiModel:", error instanceof Error ? error.message : error);
    return { error: "Impossibile salvare il modello. Riprova." };
  }

  return { ok: true };
}

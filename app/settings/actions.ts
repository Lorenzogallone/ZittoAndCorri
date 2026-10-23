"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { sanitizePrefs, type ThemePrefs } from "@/lib/theme";
import crypto from "crypto";
import { verifyGeminiApiKey } from "@/lib/ai/gemini";
import {
  removeGeminiApiKey,
  removeOpenRouterApiKey,
  setAiProvider,
  setAiRoute,
  storeGeminiApiKey,
  storeOpenRouterApiKey,
  type AiProvider,
  type AiTask,
} from "@/lib/ai/credentials";
import { OpenRouterError, verifyOpenRouterKey } from "@/lib/ai/openrouter";
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

// ── OpenRouter e modelli per compito ────────────────────────────────────────

/** Id del catalogo OpenRouter, es. "openai/gpt-5-mini" o "meta-llama/llama-4:free". */
const isOpenRouterModel = (model: string) => /^[a-z0-9][\w.-]*\/[\w.:-]+$/i.test(model) && model.length <= 120;

const MIGRATION_ERROR = "Per usare OpenRouter serve aggiornare il database (migrazione 0023).";
const ROUTING_MIGRATION_ERROR = "Per scegliere un modello per la chat e uno per le analisi serve aggiornare il database (migrazione 0024).";
const notMigrated = (error: unknown) => {
  const code = (error as { code?: string } | null)?.code;
  return code === "PGRST202" || code === "42P01" || code === "PGRST205" || code === "42703";
};

export async function saveOpenRouterKey(apiKey: string): Promise<{ error?: string; ok?: boolean }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const key = apiKey.trim();
  if (key.length < 16) return { error: "La chiave OpenRouter non sembra valida." };
  try {
    await verifyOpenRouterKey(key);
  } catch (error) {
    console.error("saveOpenRouterKey verify:", error instanceof Error ? error.message : error);
    return { error: error instanceof OpenRouterError && error.status === 401 ? "Chiave OpenRouter non valida." : "Non riesco a verificare la chiave con OpenRouter. Riprova." };
  }
  try {
    await storeOpenRouterApiKey(user.id, key);
  } catch (error) {
    console.error("saveOpenRouterKey:", error instanceof Error ? error.message : error);
    return { error: notMigrated(error) ? MIGRATION_ERROR : "Impossibile salvare la chiave. Riprova." };
  }
  revalidatePath("/settings");
  revalidatePath("/");
  return { ok: true };
}

export async function deleteOpenRouterKey(): Promise<{ error?: string; ok?: boolean }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  try {
    // I compiti che usavano OpenRouter passano da soli a Gemini (getAiConfig).
    await removeOpenRouterApiKey(user.id);
    await setAiProvider(user.id, "gemini");
  } catch (error) {
    console.error("deleteOpenRouterKey:", error instanceof Error ? error.message : error);
    return { error: "Impossibile rimuovere la chiave. Riprova." };
  }
  revalidatePath("/");
  return { ok: true };
}

/** Provider e modello predefiniti per la chat del coach o per l'analisi delle corse. */
export async function saveAiRoute(task: AiTask, provider: AiProvider, model: string): Promise<{ error?: string; ok?: boolean }> {
  if (task !== "chat" && task !== "analysis") return { error: "Compito non valido." };
  if (provider !== "gemini" && provider !== "openrouter") return { error: "Provider non valido." };
  const chosen = model.trim();
  if (provider === "gemini" ? !isGeminiModelId(chosen) : !isOpenRouterModel(chosen)) return { error: "Modello non valido." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: credential, error: credentialError } = await supabase
    .from(provider === "gemini" ? "user_ai_credentials" : "user_openrouter_credentials")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle<{ user_id: string }>();
  if (credentialError) return { error: notMigrated(credentialError) ? MIGRATION_ERROR : "Impossibile salvare il modello. Riprova." };
  if (!credential) return { error: `Aggiungi prima la chiave ${provider === "gemini" ? "Gemini" : "OpenRouter"}.` };
  try {
    await setAiRoute(user.id, task, { provider, [provider]: chosen });
  } catch (error) {
    console.error("saveAiRoute:", error instanceof Error ? error.message : error);
    return { error: notMigrated(error) ? ROUTING_MIGRATION_ERROR : "Impossibile salvare il modello. Riprova." };
  }
  revalidatePath("/");
  return { ok: true };
}

export async function setHeatAdjust(enabled: boolean): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { error } = await supabase.from("profiles").update({ heat_adjust: Boolean(enabled) }).eq("id", user.id);
  if (error) return { error: "Impostazione non salvata." };
  revalidatePath("/", "layout");
  return {};
}

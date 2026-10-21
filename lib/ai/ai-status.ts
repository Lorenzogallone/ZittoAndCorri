import "server-only";

// Stato dei provider AI per l'interfaccia (mai segreti): cosa è configurato,
// quale modello e quale provider è in uso. Tollerante se manca la migrazione 0023.

import type { SupabaseClient } from "@supabase/supabase-js";
import { GEMINI_MODELS, normalizeGeminiModel } from "@/lib/ai/models";
import type { AiProvider } from "@/lib/ai/credentials";

export interface ProviderStatus {
  configured: boolean;
  model: string | null;
  /** Nome breve per la chat, es. "3.5 Flash Lite" o "gpt-5-mini". */
  modelLabel: string | null;
  lastFour: string | null;
}

export interface AiStatus {
  /** Provider usato davvero (scelto e configurato, altrimenti l'altro). */
  active: AiProvider | null;
  preferred: AiProvider;
  gemini: ProviderStatus;
  /** Null se il database non ha ancora la migrazione 0023. */
  openrouter: ProviderStatus | null;
}

const MISSING = new Set(["42703", "42P01", "PGRST205", "PGRST202"]);

export function geminiModelLabel(model: string | null): string {
  const id = normalizeGeminiModel(model);
  return GEMINI_MODELS.find((m) => m.id === id)?.label.replace(/^Gemini /, "") ?? id;
}

/** "openai/gpt-5-mini" → "gpt-5-mini". */
export const openRouterModelLabel = (model: string | null) => (model ? model.split("/").pop()!.replace(/:free$/, " (free)") : null);

export async function getAiStatus(supabase: SupabaseClient, userId: string): Promise<AiStatus> {
  const [gemini, openrouter, profile] = await Promise.all([
    supabase.from("user_ai_credentials").select("model, last_four").eq("user_id", userId).maybeSingle<{ model: string | null; last_four: string }>(),
    supabase.from("user_openrouter_credentials").select("model, last_four").eq("user_id", userId).maybeSingle<{ model: string | null; last_four: string }>(),
    supabase.from("profiles").select("ai_provider").eq("id", userId).maybeSingle<{ ai_provider: string | null }>(),
  ]);
  const geminiStatus: ProviderStatus = {
    configured: !!gemini.data,
    model: gemini.data ? normalizeGeminiModel(gemini.data.model) : null,
    modelLabel: gemini.data ? geminiModelLabel(gemini.data.model) : null,
    lastFour: gemini.data?.last_four ?? null,
  };
  const routerStatus: ProviderStatus | null = openrouter.error && MISSING.has(openrouter.error.code)
    ? null
    : {
        // Senza modello scelto la chiave non basta per usarlo.
        configured: !!openrouter.data?.model,
        model: openrouter.data?.model ?? null,
        modelLabel: openRouterModelLabel(openrouter.data?.model ?? null),
        lastFour: openrouter.data?.last_four ?? null,
      };
  const preferred: AiProvider = profile.data?.ai_provider === "openrouter" ? "openrouter" : "gemini";
  const ready = (provider: AiProvider) => (provider === "gemini" ? geminiStatus.configured : !!routerStatus?.configured);
  const other: AiProvider = preferred === "gemini" ? "openrouter" : "gemini";
  return {
    active: ready(preferred) ? preferred : ready(other) ? other : null,
    preferred,
    gemini: geminiStatus,
    openrouter: routerStatus,
  };
}

import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeGeminiModel, type GeminiModelId } from "@/lib/ai/models";

export interface GeminiConfig {
  apiKey: string;
  model: GeminiModelId;
}

export async function getGeminiApiKey(userId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("admin_get_gemini_credential", {
    p_user_id: userId,
  });
  if (error) throw error;
  return typeof data === "string" && data.trim() ? data : null;
}

export async function getGeminiConfig(userId: string): Promise<GeminiConfig | null> {
  const admin = createAdminClient();
  const [secretResult, metadataResult] = await Promise.all([
    admin.rpc("admin_get_gemini_credential", { p_user_id: userId }),
    admin
      .from("user_ai_credentials")
      .select("model")
      .eq("user_id", userId)
      .maybeSingle<{ model: string | null }>(),
  ]);
  if (secretResult.error) throw secretResult.error;
  if (metadataResult.error) throw metadataResult.error;
  const apiKey = secretResult.data;
  if (typeof apiKey !== "string" || !apiKey.trim()) return null;
  return { apiKey, model: normalizeGeminiModel(metadataResult.data?.model) };
}

export async function storeGeminiApiKey(
  userId: string,
  apiKey: string,
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.rpc("admin_set_gemini_credential", {
    p_user_id: userId,
    p_secret: apiKey,
    p_last_four: apiKey.slice(-4),
  });
  if (error) throw error;
}

export async function setGeminiModel(userId: string, model: GeminiModelId): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("user_ai_credentials")
    .update({ model, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  if (error) throw error;
}

export async function removeGeminiApiKey(userId: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.rpc("admin_delete_gemini_credential", {
    p_user_id: userId,
  });
  if (error) throw error;
}

// ── OpenRouter e provider attivo (migrazione 0023) ──────────────────────────

export type AiProvider = "gemini" | "openrouter";

export type AiConfig =
  | { provider: "gemini"; apiKey: string; model: GeminiModelId }
  | { provider: "openrouter"; apiKey: string; model: string };

/** Funzione o colonna non ancora create: il database non ha la migrazione 0023. */
const notMigrated = (error: { code?: string } | null | undefined) =>
  error?.code === "PGRST202" || error?.code === "42703" || error?.code === "42P01" || error?.code === "PGRST205";

export async function getOpenRouterConfig(userId: string): Promise<{ apiKey: string; model: string | null } | null> {
  const admin = createAdminClient();
  const [secretResult, metadataResult] = await Promise.all([
    admin.rpc("admin_get_openrouter_credential", { p_user_id: userId }),
    admin.from("user_openrouter_credentials").select("model").eq("user_id", userId).maybeSingle<{ model: string | null }>(),
  ]);
  if (notMigrated(secretResult.error) || notMigrated(metadataResult.error)) return null;
  if (secretResult.error) throw secretResult.error;
  if (metadataResult.error) throw metadataResult.error;
  const apiKey = secretResult.data;
  if (typeof apiKey !== "string" || !apiKey.trim()) return null;
  return { apiKey, model: metadataResult.data?.model ?? null };
}

async function preferredProvider(userId: string): Promise<AiProvider> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("profiles").select("ai_provider").eq("id", userId).maybeSingle<{ ai_provider: string | null }>();
  if (error && !notMigrated(error)) throw error;
  return data?.ai_provider === "openrouter" ? "openrouter" : "gemini";
}

/**
 * Provider e modello da usare per chat, piani e analisi: quello scelto
 * dall'atleta se configurato, altrimenti l'altro. Null se nessuno è pronto.
 */
export async function getAiConfig(userId: string): Promise<AiConfig | null> {
  const [preferred, gemini, openrouter] = await Promise.all([
    preferredProvider(userId),
    getGeminiConfig(userId),
    getOpenRouterConfig(userId),
  ]);
  const router = openrouter?.model ? { provider: "openrouter" as const, apiKey: openrouter.apiKey, model: openrouter.model } : null;
  const google = gemini ? { provider: "gemini" as const, ...gemini } : null;
  return preferred === "openrouter" ? router ?? google : google ?? router;
}

export async function storeOpenRouterApiKey(userId: string, apiKey: string, model: string | null): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.rpc("admin_set_openrouter_credential", {
    p_user_id: userId,
    p_secret: apiKey,
    p_last_four: apiKey.slice(-4),
    p_model: model,
  });
  if (error) throw error;
}

export async function setOpenRouterModel(userId: string, model: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("user_openrouter_credentials")
    .update({ model, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  if (error) throw error;
}

export async function removeOpenRouterApiKey(userId: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.rpc("admin_delete_openrouter_credential", { p_user_id: userId });
  if (error) throw error;
}

export async function setAiProvider(userId: string, provider: AiProvider): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("profiles").update({ ai_provider: provider }).eq("id", userId);
  if (error) throw error;
}

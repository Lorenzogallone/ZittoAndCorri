import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeGeminiModel, type GeminiModelId } from "@/lib/ai/models";
import { parseRouting, resolveTask, withRoute, type AiProvider, type AiRouting, type AiTask, type TaskRoute } from "@/lib/ai/routing";

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

export async function removeGeminiApiKey(userId: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.rpc("admin_delete_gemini_credential", {
    p_user_id: userId,
  });
  if (error) throw error;
}

// ── OpenRouter e modello per compito (migrazioni 0023 e 0024) ───────────────

export type { AiProvider, AiTask } from "@/lib/ai/routing";

export type AiConfig = (
  | { provider: "gemini"; model: GeminiModelId }
  | { provider: "openrouter"; model: string }
) & {
  apiKey: string;
  /** Per registrare token e costo della chiamata. */
  userId: string;
  task: AiTask;
};

/** Funzione o colonna non ancora create: il database non ha la migrazione. */
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

/**
 * Provider e modello di chat e analisi (`profiles.ai_routing`). `stored` è
 * false se il database non ha ancora la migrazione 0024: allora vale per
 * tutto il provider scelto prima (`ai_provider`).
 */
export async function loadAiRouting(client: SupabaseClient, userId: string): Promise<{ routing: AiRouting; stored: boolean }> {
  const legacy = (value: string | null | undefined): AiProvider => (value === "openrouter" ? "openrouter" : "gemini");
  const full = await client.from("profiles").select("ai_provider, ai_routing").eq("id", userId).maybeSingle<{ ai_provider: string | null; ai_routing: unknown }>();
  if (!full.error) return { routing: parseRouting(full.data?.ai_routing, legacy(full.data?.ai_provider)), stored: true };
  if (!notMigrated(full.error)) throw full.error;
  const basic = await client.from("profiles").select("ai_provider").eq("id", userId).maybeSingle<{ ai_provider: string | null }>();
  if (basic.error && !notMigrated(basic.error)) throw basic.error;
  return { routing: parseRouting(null, legacy(basic.data?.ai_provider)), stored: false };
}

/**
 * Provider e modello per il compito: quelli scelti nelle impostazioni se
 * pronti, altrimenti l'altro provider. Null se nessuna chiave è configurata.
 */
export async function getAiConfig(userId: string, task: AiTask): Promise<AiConfig | null> {
  const admin = createAdminClient();
  const [{ routing }, gemini, openrouter] = await Promise.all([
    loadAiRouting(admin, userId),
    getGeminiConfig(userId),
    getOpenRouterConfig(userId),
  ]);
  const resolved = resolveTask(routing[task], {
    gemini: { configured: !!gemini, model: gemini?.model ?? null },
    openrouter: { configured: !!openrouter, model: openrouter?.model ?? null },
  });
  if (!resolved) return null;
  return resolved.provider === "gemini"
    ? { provider: "gemini", model: normalizeGeminiModel(resolved.model), apiKey: gemini!.apiKey, userId, task }
    : { provider: "openrouter", model: resolved.model, apiKey: openrouter!.apiKey, userId, task };
}

export async function storeOpenRouterApiKey(userId: string, apiKey: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.rpc("admin_set_openrouter_credential", {
    p_user_id: userId,
    p_secret: apiKey,
    p_last_four: apiKey.slice(-4),
    // Null mantiene il modello già salvato: i modelli ora si scelgono per compito.
    p_model: null,
  });
  if (error) throw error;
}

export async function removeOpenRouterApiKey(userId: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.rpc("admin_delete_openrouter_credential", { p_user_id: userId });
  if (error) throw error;
}

/** Senza la migrazione 0024 resta solo il provider unico di prima. */
export async function setAiProvider(userId: string, provider: AiProvider): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("profiles").update({ ai_provider: provider }).eq("id", userId);
  if (error) throw error;
}

/** Cambia provider e/o modello di un compito; la chat aggiorna anche ai_provider. */
export async function setAiRoute(userId: string, task: AiTask, patch: Partial<TaskRoute>): Promise<void> {
  const admin = createAdminClient();
  const { routing, stored } = await loadAiRouting(admin, userId);
  if (!stored) throw Object.assign(new Error("Migrazione 0024 mancante"), { code: "42703" });
  const next = withRoute(routing, task, patch);
  const { error } = await admin
    .from("profiles")
    .update(task === "chat" ? { ai_routing: next, ai_provider: next.chat.provider } : { ai_routing: next })
    .eq("id", userId);
  if (error) throw error;
}

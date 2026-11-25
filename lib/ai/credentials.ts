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

// ── OpenRouter and per-task model (migrations 0023 and 0024) ───────────────

export type { AiProvider, AiTask } from "@/lib/ai/routing";

export type AiConfig = (
  | { provider: "gemini"; model: GeminiModelId }
  | { provider: "openrouter"; model: string }
) & {
  apiKey: string;
  /** To record the call's tokens and cost. */
  userId: string;
  task: AiTask;
};

/** Function or column not yet created: the database lacks the migration. */
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
 * Chat and analysis provider and model (`profiles.ai_routing`). `stored` is
 * false if the database does not have migration 0024 yet: then the previously
 * chosen provider (`ai_provider`) applies to everything.
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
 * Provider and model for the task: those chosen in settings if
 * ready, otherwise the other provider. Null if no key is configured.
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

export async function storeOpenRouterApiKey(userId: string, apiKey: string, model: string | null = null): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.rpc("admin_set_openrouter_credential", {
    p_user_id: userId,
    p_secret: apiKey,
    p_last_four: apiKey.slice(-4),
    // Null keeps the already saved model (settings choose the model
    // per task); onboarding passes it because without a model the key
    // is not enough to start the coach.
    p_model: model,
  });
  if (error) throw error;
}

export async function removeOpenRouterApiKey(userId: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.rpc("admin_delete_openrouter_credential", { p_user_id: userId });
  if (error) throw error;
}

/** Without migration 0024 only the previous single provider remains. */
export async function setAiProvider(userId: string, provider: AiProvider): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("profiles").update({ ai_provider: provider }).eq("id", userId);
  if (error) throw error;
}

/** Changes provider and/or model of a task; the chat also updates ai_provider. */
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

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

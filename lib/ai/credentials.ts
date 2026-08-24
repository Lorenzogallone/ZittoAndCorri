import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export async function getGeminiApiKey(userId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("admin_get_gemini_credential", {
    p_user_id: userId,
  });
  if (error) throw error;
  return typeof data === "string" && data.trim() ? data : null;
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

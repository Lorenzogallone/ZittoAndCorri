import "server-only";

// Title and body of the "Analysis ready" notification, in the language saved
// on the user's profile (an import or a job has no NEXT_LOCALE cookie).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Locale } from "../../i18n/config.ts";
import { staticTranslator } from "@/lib/static-translator";
import { analysisPushBody } from "@/lib/push/messages";
import { loadUserLocale } from "@/lib/push/user-locale";

/** `fallback`: the request's language, used when the profile has none saved. */
export async function analysisPush(
  admin: SupabaseClient,
  userId: string,
  fallback: Locale,
  summary: string | null | undefined,
): Promise<{ title: string; body: string }> {
  const t = await staticTranslator(await loadUserLocale(admin, userId, fallback), "push");
  return { title: t("analysis.title"), body: analysisPushBody(summary, t) };
}

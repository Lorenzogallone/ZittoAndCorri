import "server-only";

// Keeps profiles.locale (migration 0033) aligned with the language the user
// picked, so cron jobs and push notifications can write in it. Best effort:
// without the column, or on any error, it does nothing and breaks nothing.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Locale } from "../i18n/config.ts";

export async function saveProfileLocale(supabase: SupabaseClient, userId: string, locale: Locale): Promise<void> {
  try {
    const { error } = await supabase.from("profiles").update({ locale }).eq("id", userId);
    // 42703 / PGRST204: column missing (migration not applied): stay silent.
    if (error && error.code !== "42703" && error.code !== "PGRST204") console.error("saveProfileLocale:", error.message);
  } catch (error) {
    console.error("saveProfileLocale:", error instanceof Error ? error.message : error);
  }
}

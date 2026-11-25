import "server-only";

// Language saved on the profile (migration 0033). Jobs without a request
// (cron, push) have no NEXT_LOCALE cookie, so they read it from here. Without
// the column (migration not applied) or on any error everything stays Italian.

import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_LOCALE, type Locale } from "../../i18n/config.ts";
import { localeOrDefault } from "./locale.ts";

/** Locale of each user; users missing from the result use the default. */
export async function loadUserLocales(
  admin: SupabaseClient,
  userIds: string[],
  fallback: Locale = DEFAULT_LOCALE,
): Promise<Map<string, Locale>> {
  const locales = new Map<string, Locale>();
  if (!userIds.length) return locales;
  try {
    const { data, error } = await admin
      .from("profiles")
      .select("id, locale")
      .in("id", userIds)
      .returns<Array<{ id: string; locale: string | null }>>();
    // 42703 / PGRST204: column missing (migration not applied): stay silent.
    if (error) {
      if (error.code !== "42703" && error.code !== "PGRST204") console.error("loadUserLocales:", error.message);
      return locales;
    }
    for (const row of data ?? []) locales.set(row.id, localeOrDefault(row.locale, fallback));
  } catch (error) {
    console.error("loadUserLocales:", error instanceof Error ? error.message : error);
  }
  return locales;
}

export async function loadUserLocale(admin: SupabaseClient, userId: string, fallback: Locale = DEFAULT_LOCALE): Promise<Locale> {
  return (await loadUserLocales(admin, [userId], fallback)).get(userId) ?? fallback;
}

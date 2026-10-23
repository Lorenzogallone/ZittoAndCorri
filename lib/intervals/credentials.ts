import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { IntervalsTargetPreference } from "@/lib/intervals/workout-text";

/** Metadati visibili all'utente (riga di user_intervals_credentials, mai la chiave). */
export interface IntervalsConnectionView {
  last_four: string;
  athlete_id: string;
  athlete_name: string | null;
  import_activities: boolean;
  import_wellness: boolean;
  publish_plan: boolean;
  target_preference: IntervalsTargetPreference;
  last_import_at: string | null;
  last_publish_at: string | null;
  last_error: string | null;
  verified_at: string;
}

export interface IntervalsOptions {
  import_activities?: boolean;
  import_wellness?: boolean;
  publish_plan?: boolean;
  target_preference?: IntervalsTargetPreference;
}

export const INTERVALS_COLUMNS =
  "last_four, athlete_id, athlete_name, import_activities, import_wellness, publish_plan, target_preference, last_import_at, last_publish_at, last_error, verified_at";

/** Funzione o tabella non ancora create: il database non ha la migrazione 0025. */
export const intervalsNotMigrated = (error: { code?: string } | null | undefined) =>
  error?.code === "PGRST202" || error?.code === "42703" || error?.code === "42P01" || error?.code === "PGRST205";

export async function getIntervalsConnection(
  client: SupabaseClient,
  userId: string,
): Promise<IntervalsConnectionView | null | undefined> {
  const { data, error } = await client
    .from("user_intervals_credentials")
    .select(INTERVALS_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle<IntervalsConnectionView>();
  if (intervalsNotMigrated(error)) return undefined;
  if (error) throw error;
  return data ?? null;
}

export async function getIntervalsApiKey(userId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("admin_get_intervals_credential", { p_user_id: userId });
  if (intervalsNotMigrated(error)) return null;
  if (error) throw error;
  return typeof data === "string" && data.trim() ? data : null;
}

export async function storeIntervalsApiKey(
  userId: string,
  apiKey: string,
  athlete: { id: string; name: string | null },
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.rpc("admin_set_intervals_credential", {
    p_user_id: userId,
    p_secret: apiKey,
    p_last_four: apiKey.slice(-4),
    p_athlete_id: athlete.id,
    p_athlete_name: athlete.name,
  });
  if (error) throw error;
}

export async function removeIntervalsApiKey(userId: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.rpc("admin_delete_intervals_credential", { p_user_id: userId });
  if (error) throw error;
}

export async function updateIntervalsOptions(userId: string, options: IntervalsOptions): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("user_intervals_credentials")
    .update({ ...options, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  if (error) throw error;
}

export async function markIntervalsSync(
  userId: string,
  patch: { last_import_at?: string; last_publish_at?: string; last_error?: string | null },
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("user_intervals_credentials")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  if (error) console.error("markIntervalsSync:", error.message);
}

/**
 * Prenota un import se l'ultimo è più vecchio di `minIntervalMs`: aggiorna
 * last_import_at solo in quel caso, così due pagine aperte insieme non lanciano
 * due import. Ritorna la connessione se la prenotazione è riuscita.
 */
export async function claimIntervalsImport(
  userId: string,
  minIntervalMs: number,
): Promise<IntervalsConnectionView | null> {
  const admin = createAdminClient();
  const now = new Date();
  const threshold = new Date(now.getTime() - minIntervalMs).toISOString();
  const { data, error } = await admin
    .from("user_intervals_credentials")
    .update({ last_import_at: now.toISOString() })
    .eq("user_id", userId)
    .or(`last_import_at.is.null,last_import_at.lt."${threshold}"`)
    .select(INTERVALS_COLUMNS)
    .maybeSingle<IntervalsConnectionView>();
  if (intervalsNotMigrated(error)) return null;
  if (error) {
    console.error("claimIntervalsImport:", error.message);
    return null;
  }
  return data ?? null;
}

/** Utenti con una chiave Intervals.icu salvata: usato dal cron. */
export async function listIntervalsUsers(): Promise<Array<{ user_id: string } & IntervalsConnectionView>> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("user_intervals_credentials")
    .select(`user_id, ${INTERVALS_COLUMNS}`)
    .returns<Array<{ user_id: string } & IntervalsConnectionView>>();
  if (intervalsNotMigrated(error)) return [];
  if (error) throw error;
  return data ?? [];
}

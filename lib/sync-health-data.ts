import "server-only";

// Legge dal database lo stato delle integrazioni per lib/sync-health. Funziona
// con il client dell'utente (home, RLS) e con quello admin (cron). Una tabella
// non ancora migrata vale "integrazione non collegata": niente avvisi.

import type { SupabaseClient } from "@supabase/supabase-js";
import { intervalsNotMigrated } from "@/lib/intervals/credentials";
import { syncHealthIssues, type SyncHealthInput, type SyncIssue } from "@/lib/sync-health";

export async function loadSyncHealthInput(client: SupabaseClient, userId: string): Promise<SyncHealthInput> {
  const [intervalsRes, zeppRes, metricRes, wellnessRes] = await Promise.all([
    client
      .from("user_intervals_credentials")
      .select("last_error, import_wellness, verified_at")
      .eq("user_id", userId)
      .maybeSingle<{ last_error: string | null; import_wellness: boolean; verified_at: string | null }>(),
    client
      .from("zepp_connections")
      .select("enabled, last_sync_at, paired_at")
      .eq("user_id", userId)
      .eq("client_kind", "health")
      .maybeSingle<{ enabled: boolean; last_sync_at: string | null; paired_at: string | null }>(),
    client
      .from("zepp_daily_metrics")
      .select("date")
      .eq("user_id", userId)
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle<{ date: string }>(),
    client
      .from("wellness_daily")
      .select("date")
      .eq("user_id", userId)
      .eq("source", "intervals")
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle<{ date: string }>(),
  ]);

  for (const [name, res] of [["intervals", intervalsRes], ["zepp", zeppRes], ["zepp metrics", metricRes], ["wellness", wellnessRes]] as const) {
    if (res.error && !intervalsNotMigrated(res.error)) console.error(`sync health ${name}:`, res.error.message);
  }

  const intervals = intervalsRes.error ? null : intervalsRes.data;
  const zepp = zeppRes.error ? null : zeppRes.data;
  return {
    intervals: intervals
      ? { lastError: intervals.last_error, importWellness: intervals.import_wellness, connectedAt: intervals.verified_at }
      : null,
    zepp: zepp ? { enabled: zepp.enabled, lastSyncAt: zepp.last_sync_at, pairedAt: zepp.paired_at } : null,
    latestHealthDate: {
      zepp: metricRes.error ? null : metricRes.data?.date ?? null,
      intervals: wellnessRes.error ? null : wellnessRes.data?.date ?? null,
    },
  };
}

/** Problemi di sincronizzazione dell'utente; vuoto anche se la lettura non riesce. */
export async function loadSyncIssues(client: SupabaseClient, userId: string, now = new Date()): Promise<SyncIssue[]> {
  try {
    return syncHealthIssues(await loadSyncHealthInput(client, userId), now);
  } catch (error) {
    console.error("loadSyncIssues:", error instanceof Error ? error.message : error);
    return [];
  }
}

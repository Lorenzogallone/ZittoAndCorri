import "server-only";

// Ricalcolo del tempo in zona delle corse già salvate. time_in_zone viene
// fissato all'import con le zone di quel momento: quando cambiano FC max, FC a
// riposo o il modello delle zone, le corse vecchie restano con soglie diverse
// da quelle nuove e il carico confronta settimane misurate in modo diverso.
// Qui si riallineano tutte alle zone correnti (solo le righe che cambiano).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { HrPoint, Profile, TimeInZone } from "@/lib/types";
import { timeInZoneFromAverage, timeInZoneFromSeries, type HrConfig } from "@/lib/metrics/zones";
import { getEffectiveHrConfig } from "@/lib/zepp/effective-hr";

/** Finestra ricalcolata: copre baseline, CTL a 42 giorni e storico del coach. */
const REFRESH_DAYS = 120;

interface ActivityZoneRow {
  id: string;
  duration_s: number;
  avg_hr: number | null;
  time_in_zone: TimeInZone | null;
}

function sameZones(a: TimeInZone | null, b: TimeInZone | null): boolean {
  const keys = ["z1", "z2", "z3", "z4", "z5"] as const;
  return keys.every((key) => Math.round(a?.[key] ?? 0) === Math.round(b?.[key] ?? 0));
}

export async function refreshTimeInZones(
  supabase: SupabaseClient,
  userId: string,
  config?: HrConfig,
): Promise<{ checked: number; updated: number }> {
  let hrConfig = config;
  if (!hrConfig) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("max_hr, resting_hr")
      .eq("id", userId)
      .maybeSingle<Pick<Profile, "max_hr" | "resting_hr">>();
    hrConfig = await getEffectiveHrConfig(supabase, userId, profile ?? null);
  }

  const since = new Date(Date.now() - REFRESH_DAYS * 86_400_000).toISOString();
  const { data: activities, error } = await supabase
    .from("activities")
    .select("id, duration_s, avg_hr, time_in_zone")
    .eq("user_id", userId)
    .gte("started_at", since)
    .returns<ActivityZoneRow[]>();
  if (error) throw error;
  if (!activities?.length) return { checked: 0, updated: 0 };

  const { data: streams, error: streamError } = await supabase
    .from("activity_streams")
    .select("activity_id, hr_series")
    .in("activity_id", activities.map((activity) => activity.id))
    .returns<Array<{ activity_id: string; hr_series: HrPoint[] | null }>>();
  if (streamError) throw streamError;
  const seriesById = new Map((streams ?? []).map((row) => [row.activity_id, row.hr_series]));

  let updated = 0;
  for (const activity of activities) {
    const series = seriesById.get(activity.id);
    const next = series && series.length >= 2
      ? timeInZoneFromSeries(series, hrConfig)
      : timeInZoneFromAverage(activity.avg_hr, activity.duration_s, hrConfig);
    if (next == null || sameZones(activity.time_in_zone, next)) continue;
    const { error: updateError } = await supabase
      .from("activities")
      .update({ time_in_zone: next })
      .eq("id", activity.id)
      .eq("user_id", userId);
    if (updateError) throw updateError;
    updated += 1;
  }
  return { checked: activities.length, updated };
}

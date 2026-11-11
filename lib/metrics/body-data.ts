import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays } from "@/lib/local-date";
import {
  bodyTrends,
  type BodyMetricKey,
  type LoadPoint,
  type MetricTrend,
  type RunInput,
  type WellnessDayInput,
  type ZeppDayInput,
} from "@/lib/metrics/body-trends";

/** Giorni di storico per i trend dell'orologio. */
export const BODY_HISTORY_DAYS = 120;

const ZEPP_COLUMNS = "date, vo2_max, training_load, sleep_total_min, sleep_deep_min, sleep_score, resting_hr, stress_avg, spo2_avg, steps, pai_total";
const WELLNESS_COLUMNS = "date, sleep_secs, sleep_score, resting_hr, hrv, stress, spo2, steps, vo2max, weight_kg";

function numberOrNull(value: unknown): number | null {
  const number = typeof value === "string" ? Number(value) : value;
  return typeof number === "number" && Number.isFinite(number) ? number : null;
}

function numericRow<T>(row: Record<string, unknown>, keys: readonly string[]): T {
  const out: Record<string, unknown> = { date: String(row.date) };
  for (const key of keys) out[key] = numberOrNull(row[key]);
  return out as T;
}

/**
 * Storico dell'orologio per i trend: tutte le righe degli ultimi 120 giorni,
 * anche se la sync è ferma (lo stato di forma di oggi invece le scarta).
 * Senza la migrazione 0025 wellness_daily non c'è: si va avanti con Zepp.
 */
export async function loadBodyTrends(
  supabase: SupabaseClient,
  userId: string,
  today: string,
  load: LoadPoint[],
  runs: RunInput[] = [],
): Promise<Record<BodyMetricKey, MetricTrend>> {
  const since = addDays(today, -BODY_HISTORY_DAYS);
  const [zeppResult, wellnessResult] = await Promise.all([
    supabase.from("zepp_daily_metrics").select(ZEPP_COLUMNS).eq("user_id", userId).gte("date", since).order("date").returns<Record<string, unknown>[]>(),
    supabase.from("wellness_daily").select(WELLNESS_COLUMNS).eq("user_id", userId).eq("source", "intervals").gte("date", since).order("date").returns<Record<string, unknown>[]>(),
  ]);
  const zeppKeys = ZEPP_COLUMNS.split(", ").slice(1);
  const wellnessKeys = WELLNESS_COLUMNS.split(", ").slice(1);
  const zepp = zeppResult.error ? [] : (zeppResult.data ?? []).map((row) => numericRow<ZeppDayInput>(row, zeppKeys));
  const wellness = wellnessResult.error ? [] : (wellnessResult.data ?? []).map((row) => numericRow<WellnessDayInput>(row, wellnessKeys));
  return bodyTrends({ today, zepp, wellness, runs, load });
}

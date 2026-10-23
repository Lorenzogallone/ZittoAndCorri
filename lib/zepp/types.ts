import type { ATLCTLResult } from "@/lib/types";

export interface ZeppConnectionView {
  enabled: boolean;
  auto_sync: boolean;
  device_name: string | null;
  device_source: number | null;
  os_version: string | null;
  firmware_version: string | null;
  api_level: string | null;
  paired_at: string | null;
  last_sync_at: string | null;
  last_error: string | null;
}

export interface ZeppDailyMetric {
  date: string;
  captured_at: string;
  training_load: number | null;
  vo2_max: number | null;
  recovery_raw: number | null;
  sleep_score: number | null;
  sleep_total_min: number | null;
  sleep_deep_min: number | null;
  sleep_start_min: number | null;
  sleep_end_min: number | null;
  nap_total_min: number | null;
  nap_count: number | null;
  resting_hr: number | null;
  max_hr: number | null;
  stress_avg: number | null;
  stress_last_week: number[] | null;
  spo2_avg: number | null;
  spo2_min: number | null;
  pai_total: number | null;
  pai_today: number | null;
  steps: number | null;
  step_target: number | null;
  calories: number | null;
  calorie_target: number | null;
  stand_hours: number | null;
  stand_target: number | null;
  hr_zone_type: number | null;
  hr_zone_rest: number | null;
  hr_zone_ranges: number[] | null;
  device_profile: Record<string, unknown> | null;
  completeness?: Record<string, boolean> | null;
}

export type ZeppReadinessStatus =
  | "intense"
  | "ready"
  | "moderate"
  | "recovery"
  | "rest";

export type ZeppReadinessComponentKey =
  | "recovery"
  | "training_load"
  | "sleep"
  | "resting_hr"
  | "stress"
  | "hrv"
  | "internal_load";

export interface ZeppReadinessComponent {
  key: ZeppReadinessComponentKey;
  label: string;
  score: number;
  weight: number;
  value: number | null;
  detail: string;
}

export interface ZeppReadinessResult {
  available: boolean;
  score: number | null;
  status: ZeppReadinessStatus | null;
  confidence: "low" | "medium" | "high";
  /** zepp_assisted: c'è almeno un segnale Zepp; wellness: solo sonno/FC/HRV (es. Intervals.icu). */
  source: "zepp_assisted" | "wellness" | "internal";
  freshness_hours: number | null;
  components: ZeppReadinessComponent[];
  internal: ATLCTLResult;
}

/** Giorno di wellness_daily (migrazione 0025), per ora da Intervals.icu. */
export interface WellnessDay {
  date: string;
  captured_at: string;
  source: "intervals" | "zepp" | "manual";
  sleep_secs: number | null;
  sleep_score: number | null;
  resting_hr: number | null;
  /** rMSSD in ms. */
  hrv: number | null;
  spo2: number | null;
  steps: number | null;
}

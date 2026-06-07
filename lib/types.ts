// Tipi riga scritti a mano per le tabelle usate in Fase 1.
// In futuro si può sostituire con `supabase gen types` (richiede CLI/login).

export type WorkoutType =
  | "easy"
  | "tempo"
  | "interval"
  | "long"
  | "race"
  | "recovery"
  | "cross";

export type ActivitySource =
  | "manual"
  | "json_import"
  | "file"
  | "strava"
  | "healthkit";

export const WORKOUT_TYPES: WorkoutType[] = [
  "easy",
  "tempo",
  "interval",
  "long",
  "race",
  "recovery",
  "cross",
];

export type ZoneKey = "z1" | "z2" | "z3" | "z4" | "z5";

/** Secondi trascorsi per zona HR. */
export type TimeInZone = Partial<Record<ZoneKey, number>>;

export interface Profile {
  id: string;
  display_name: string | null;
  max_hr: number | null;
  resting_hr: number | null;
  birthdate: string | null;
  created_at: string;
}

/** Un split per km calcolato da gps_series. PLAN.md §7. */
export interface Split {
  km: number;
  time_s: number;
  avg_hr?: number;
}

/** Punto GPS normalizzato (dal parser GPX / stream). */
export interface GpsPoint {
  t: number;
  lat: number;
  lon: number;
  ele?: number;
}

/** Punto HR normalizzato. */
export interface HrPoint {
  t: number;
  bpm: number;
}

export interface Activity {
  id: string;
  user_id: string;
  source: ActivitySource;
  type: WorkoutType;
  started_at: string;
  distance_m: number;
  duration_s: number;
  moving_time_s: number | null;
  avg_pace_s_km: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  elevation_gain_m: number | null;
  rpe: number | null;
  calories: number | null;
  time_in_zone: TimeInZone | null;
  splits: Split[] | null;
  notes: string | null;
  raw_payload: unknown | null;
  created_at: string;
}

/** Riga activity_streams — stream pesanti, mai nel prompt LLM. PLAN.md §3. */
export interface ActivityStream {
  activity_id: string;
  hr_series: HrPoint[] | null;
  gps_series: GpsPoint[] | null;
  cadence: unknown | null;
}

/** Un punto per il carico giornaliero — usato da computeATLCTL. */
export interface LoadPoint {
  date: string; // YYYY-MM-DD
  load: number;
}

/** Output di computeATLCTL. PLAN.md §7. */
export interface ATLCTLResult {
  atl: number;
  ctl: number;
  tsb: number;
  series: Array<{ date: string; atl: number; ctl: number; tsb: number }>;
}

/** Predizioni Riegel per le distanze canoniche. PLAN.md §7. */
export interface RacePredict {
  "5k": number;
  "10k": number;
  half: number;
  target?: number;
}

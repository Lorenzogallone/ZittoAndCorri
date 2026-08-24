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

// Sport dell'attività. "running" è il default storico; gli altri servono per
// le attività extra (importate da .fit o manuali) che alimentano il carico ma
// non le statistiche di corsa. Colonna `activities.sport` (text + CHECK).
export const SPORTS = [
  "running",
  "cycling",
  "swimming",
  "strength",
  "hiking",
  "walking",
  "soccer",
  "tennis",
  "padel",
  "yoga",
  "pilates",
  "ski",
  "other",
] as const;

export type Sport = (typeof SPORTS)[number];

export type ZoneKey = "z1" | "z2" | "z3" | "z4" | "z5";

/** Secondi trascorsi per zona HR. */
export type TimeInZone = Partial<Record<ZoneKey, number>>;

export interface Profile {
  id: string;
  display_name: string | null;
  max_hr: number | null;
  resting_hr: number | null;
  birthdate: string | null;
  api_key: string | null;
  /** Preferenze tema (Impostazioni → Aspetto). Vedi lib/theme.ts. */
  theme_mode: string | null;
  theme_accent: string | null;
  theme_style: string | null;
  onboarding_completed_at: string | null;
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
  sport: Sport;
  started_at: string;
  distance_m: number;
  duration_s: number;
  moving_time_s: number | null;
  avg_pace_s_km: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  elevation_gain_m: number | null;
  rpe: number | null;
  /** Origine dello sforzo: file FIT, utente o API esterna. */
  rpe_source: "fit" | "user" | "api" | null;
  /** Titolo originale della sessione, separato dalle note dell'atleta. */
  source_title: string | null;
  calories: number | null;
  /** Cadenza media in passi/minuto, derivata dagli stream in ingest. */
  avg_cadence_spm: number | null;
  /** Deriva cardiaca % (decoupling passo/HR prima vs seconda metà). */
  hr_drift_pct: number | null;
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

// ── Fase 3 ──────────────────────────────────────────────────────────────────

// Modello semplificato: un workout è solo "planned" finché non viene collegata
// una corsa reale, che lo porta a "completed". "missed" non è uno stato salvato
// ma un concetto calcolato in fase di aderenza (planned con data passata).
export type PlannedStatus = "planned" | "completed";

export interface Goal {
  id: string;
  user_id: string;
  race_name: string;
  race_date: string | null;
  distance_m: number;
  target_time_s: number | null;
  is_active: boolean;
  created_at: string;
}

export interface PlannedWorkout {
  id: string;
  user_id: string;
  goal_id: string | null;
  date: string;
  type: WorkoutType;
  target_distance_m: number | null;
  target_pace_s_km: number | null;
  target_duration_s: number | null;
  /** HR media massima indicativa per la seduta (bpm). */
  target_hr_bpm: number | null;
  description: string | null;
  /** Indicazioni del coach: cosa pensare, cosa privilegiare/sacrificare. */
  focus: string | null;
  status: PlannedStatus;
  activity_id: string | null;
  created_at: string;
  updated_at: string;
  origin: "user" | "ai";
}

export interface AdherenceResult {
  total: number;
  completed: number;
  missed: number;
  pct: number;
}

// ── Fase 4: Coach AI ──────────────────────────────────────────────────────────

/** Riga evaluations — valutazione discorsiva AI di una corsa. PLAN.md §5/§8. */
export interface Evaluation {
  id: string;
  user_id: string;
  activity_id: string;
  model: string | null;
  summary: string | null;
  /** Flag qualitativi, es. {"overreaching":true,"good_progress":true}. */
  flags: Record<string, boolean> | null;
  created_at: string;
}

/** Riga plan_reviews — review bisettimanale prodotta dal bottone "Pianifica". */
export interface PlanReview {
  id: string;
  user_id: string;
  goal_id: string | null;
  range_start: string;
  range_end: string;
  summary: string;
  comments: string | null;
  model: string | null;
  created_at: string;
}

/** Output strutturato della valutazione di una corsa (responseSchema Gemini). */
export interface EvaluationResult {
  summary: string;
  flags: Record<string, boolean>;
}

/** Un workout proposto dall'LLM, prima della validazione/clamp deterministico. */
export interface ProposedWorkout {
  date: string;
  type: WorkoutType;
  target_distance_m: number | null;
  target_pace_s_km: number | null;
  target_duration_s: number | null;
  target_hr_bpm: number | null;
  description: string | null;
  focus: string | null;
}

/** Output strutturato della generazione piano (responseSchema Gemini). */
export interface PlanGenerationResult {
  review_summary: string;
  /** Memoria di fase del coach, persistita in athlete_snapshot.narrative. */
  coach_memory?: string;
  workouts: ProposedWorkout[];
}

export type CoachMemoryCategory =
  | "availability"
  | "vacation"
  | "weather"
  | "preference"
  | "fatigue"
  | "limitation"
  | "pace_hr"
  | "long_term";

export interface CoachMessage {
  id: string;
  user_id: string;
  role: "user" | "assistant" | "system";
  kind: "chat" | "activity_feedback" | "plan_proposal" | "status";
  content: string;
  activity_id: string | null;
  job_id: string | null;
  plan_proposal_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface CoachMemory {
  id: string;
  user_id: string;
  category: CoachMemoryCategory;
  content: string;
  valid_from: string | null;
  valid_until: string | null;
  source: "chat" | "activity_feedback" | "migration";
  confidence: number;
  source_message_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PlanProposal {
  id: string;
  user_id: string;
  source_message_id: string | null;
  summary: string;
  range_start: string;
  range_end: string;
  workouts: ProposedWorkout[];
  status: "pending" | "applied" | "rejected" | "stale";
  created_at: string;
  applied_at: string | null;
}

export interface AiCredentialMetadata {
  provider: "gemini";
  last_four: string;
  verified_at: string;
  updated_at: string;
}

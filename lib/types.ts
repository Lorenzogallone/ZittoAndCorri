// Hand-written row types for the tables used in Phase 1.
// In the future this can be replaced with `supabase gen types` (requires CLI/login).

import type { BestEfforts } from "./metrics/best-efforts.ts";
import type { PaceCheck } from "./metrics/pace-check.ts";
import type { DistancePoint, FitLap, IntervalAnalysis } from "./metrics/intervals.ts";
import type { ProposalChange } from "./plan/proposal-diff.ts";

export type WorkoutType =
  | "easy"
  | "tempo"
  | "interval"
  | "long"
  | "race"
  | "recovery"
  | "cross";

/**
 * Imported activities are not automatically given a workout intent: the
 * neutral type avoids confusing a real run with a planned easy
 * session.
 */
export type ActivityType = WorkoutType | "unclassified";

export type ActivitySource =
  | "manual"
  | "json_import"
  | "file"
  | "strava"
  | "intervals"
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

export const ACTIVITY_TYPES: ActivityType[] = ["unclassified", ...WORKOUT_TYPES];

// Activity sport. "running" is the historical default; the others are for
// extra activities (imported from .fit or manual) that feed the load.
// Walks and hikes also count in the on-foot distance summaries.
// Column `activities.sport` (text + CHECK).
export const SPORTS = [
  "running",
  "cycling",
  "swimming",
  "strength",
  "hiking",
  "walking",
  "soccer",
  "beach_volley",
  "tennis",
  "padel",
  "yoga",
  "pilates",
  "ski",
  "other",
] as const;

export type Sport = (typeof SPORTS)[number];

/** On-foot sports whose distance is comparable in volume summaries. */
export function isFootDistanceSport(sport: Sport): boolean {
  return sport === "running" || sport === "walking" || sport === "hiking";
}

export type ZoneKey = "z1" | "z2" | "z3" | "z4" | "z5";

/** Seconds spent per HR zone. */
export type TimeInZone = Partial<Record<ZoneKey, number>>;

export interface Profile {
  id: string;
  display_name: string | null;
  max_hr: number | null;
  resting_hr: number | null;
  birthdate: string | null;
  api_key: string | null;
  /** Theme preferences (Settings → Appearance). See lib/theme.ts. */
  theme_mode: string | null;
  theme_accent: string | null;
  theme_style: string | null;
  /** Adapts the pace to the forecast heat and humidity. */
  heat_adjust: boolean;
  onboarding_completed_at: string | null;
  created_at: string;
}

/** One per-km split computed from gps_series. PLAN.md §7. */
export interface Split {
  km: number;
  time_s: number;
  avg_hr?: number;
}

/** Normalized GPS point (from the GPX parser / stream). */
export interface GpsPoint {
  t: number;
  lat: number;
  lon: number;
  ele?: number;
}

/** Normalized HR point. */
export interface HrPoint {
  t: number;
  bpm: number;
}

export interface Activity {
  id: string;
  user_id: string;
  source: ActivitySource;
  type: ActivityType;
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
  /** Source of the effort: FIT file, user or external API. */
  rpe_source: "fit" | "user" | "api" | null;
  /** Original session title, kept separate from the athlete's notes. */
  source_title: string | null;
  calories: number | null;
  /** Average cadence in steps/minute, derived from the streams at ingest. */
  avg_cadence_spm: number | null;
  /** Cardiac drift % (pace/HR decoupling first vs second half). */
  hr_drift_pct: number | null;
  time_in_zone: TimeInZone | null;
  splits: Split[] | null;
  /** Best times over standard distances (see lib/metrics/best-efforts). */
  best_efforts: BestEfforts | null;
  /** Actual pace vs planned in sessions with targets (lib/metrics/pace-check). */
  pace_check: PaceCheck | null;
  /** Session segments (migration 0022: absent on unmigrated DBs). */
  intervals?: IntervalAnalysis | null;
  notes: string | null;
  /** Migration 0026: excluded from totals, records and load (stays visible). */
  excluded_at?: string | null;
  excluded_reason?: string | null;
  raw_payload: unknown | null;
  created_at: string;
}

/** activity_streams row — heavy streams, never in the LLM prompt. PLAN.md §3. */
export interface ActivityStream {
  activity_id: string;
  hr_series: HrPoint[] | null;
  gps_series: GpsPoint[] | null;
  cadence: unknown | null;
  /** Migration 0022: watch distance and laps from the FIT file. */
  distance_series?: DistancePoint[] | null;
  laps?: FitLap[] | null;
}

/** One point for the daily load — used by computeATLCTL. */
export interface LoadPoint {
  date: string; // YYYY-MM-DD
  load: number;
}

/** Output of computeATLCTL. PLAN.md §7. */
export interface ATLCTLResult {
  /** Sum of the internal load of the last 7 days, conceptually (not in scale) comparable with Zepp. */
  load7: number;
  atl: number;
  ctl: number;
  tsb: number;
  /** Average 7d load of the previous period, personalized on the available history. */
  baseline7: number | null;
  /** Ratio between current 7d load and personal baseline. */
  load_ratio: number | null;
  status: "calibrating" | "fresh" | "balanced" | "strained" | "fatigued";
  confidence: "low" | "medium" | "high";
  history_days: number;
  sources: {
    heart_rate: number;
    rpe: number;
    estimated: number;
  };
  series: Array<{
    date: string;
    daily_load: number;
    load7: number;
    atl: number;
    ctl: number;
    tsb: number;
    baseline7: number | null;
    load_ratio: number | null;
  }>;
}

/** Riegel predictions for the canonical distances. PLAN.md §7. */
export interface RacePredict {
  "5k": number;
  "10k": number;
  half: number;
  target?: number;
}

// ── Phase 3 ──────────────────────────────────────────────────────────────────

// The planned workout status can be managed manually. Real activities
// stay independent: the coach compares plan and actual from data and dates.
// "skipped" = session paused ("I don't feel 100%"), can be restored.
export type PlannedStatus = "planned" | "completed" | "skipped";

/** Time of day of a session, when a day has more than one. */
export type DayPart = "morning" | "afternoon" | "evening";
export const DAY_PARTS: DayPart[] = ["morning", "afternoon", "evening"];

export type WorkoutStepKind = "warmup" | "work" | "recovery" | "steady" | "cooldown";
export type WorkoutStepCompletion = "time" | "distance" | "manual";
/** How the phase is run: sprint (all out) or recovery by jogging/walking. */
export type WorkoutStepVariant = "sprint" | "jog" | "walk";
export const WORKOUT_STEP_VARIANTS = ["sprint", "jog", "walk"] as const;

/** Guided phase of a workout, also consumed by the Zepp Workout Extension. */
export interface WorkoutStepInput {
  kind: WorkoutStepKind;
  label: string;
  completion_type: WorkoutStepCompletion;
  completion_value: number | null;
  pace_min_s_km: number | null;
  pace_max_s_km: number | null;
  hr_min_bpm: number | null;
  hr_max_bpm: number | null;
  /** Only for work (sprint) and recovery (jog, walk); absent = as per kind. */
  variant?: WorkoutStepVariant | null;
}

export interface WorkoutStep extends WorkoutStepInput {
  id: string;
  order: number;
}

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
  /** Indicative maximum average HR for the session (bpm). */
  target_hr_bpm: number | null;
  workout_steps: WorkoutStep[];
  description: string | null;
  /** Coach guidance: what to think about, what to favor/sacrifice. */
  focus: string | null;
  status: PlannedStatus;
  /** Original values of a lightened session: allow undoing. */
  adapted_from: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  origin: "user" | "ai";
  /** Position in the day (1 = first). Absent before migration 0029. */
  day_order?: number;
  /** Morning, afternoon or evening; null if not specified. */
  day_part?: DayPart | null;
  /** Done right after the previous session of the same day (a single outing). */
  chained?: boolean;
}

// ── Phase 4: AI Coach ──────────────────────────────────────────────────────────

/** evaluations row — free-form AI evaluation of a run. PLAN.md §5/§8. */
export interface Evaluation {
  id: string;
  user_id: string;
  activity_id: string;
  model: string | null;
  summary: string | null;
  /** Clean points extracted from the athlete's free comment. */
  details: string[] | null;
  /** Qualitative flags, e.g. {"overreaching":true,"good_progress":true}. */
  flags: Record<string, boolean> | null;
  /** Tokens and cost of the analysis (migration 0024), see lib/ai/usage.ts. */
  ai_usage?: unknown;
  created_at: string;
}

/** Structured output of a run evaluation (Gemini responseSchema). */
export interface EvaluationResult {
  summary: string;
  details: string[];
  flags: Record<string, boolean>;
}

/** A workout proposed by the LLM, before deterministic validation/clamping. */
export interface ProposedWorkout {
  date: string;
  type: WorkoutType;
  target_distance_m: number | null;
  target_pace_s_km: number | null;
  target_duration_s: number | null;
  target_hr_bpm: number | null;
  workout_steps: WorkoutStepInput[];
  description: string | null;
  focus: string | null;
  day_part?: DayPart | null;
  chained?: boolean | null;
}

/** Structured output of plan generation (Gemini responseSchema). */
export interface PlanGenerationResult {
  review_summary: string;
  /** Coach phase memory, persisted in athlete_snapshot.narrative. */
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
  | "long_term"
  | "guideline";

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
  /** Migration 0023: days to clear and before/after per day. */
  remove_dates?: string[] | null;
  changes?: ProposalChange[] | null;
  /** "expired" only in the app (lib/plan/proposal-expiry.ts): in the db it stays "pending". */
  status: "pending" | "applied" | "rejected" | "stale" | "expired";
  expired_reason?: "too_old" | "superseded" | "past";
  created_at: string;
  applied_at: string | null;
}

export interface AiCredentialMetadata {
  provider: "gemini";
  last_four: string;
  model: string;
  verified_at: string;
  updated_at: string;
}

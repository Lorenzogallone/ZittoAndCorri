// Interval analysis: splits a run into its segments (warm-up,
// fast segments, sprints, jog or walk recoveries, cool-down) and
// measures how each one was run. The structure comes, in order of
// reliability, from:
//   1. the FIT file laps, if they are not the usual automatic per-km laps;
//   2. a declared structure (athlete's note or plan session), which is
//      aligned to the speed curve with an optimal segmentation;
//   3. multi-level automatic detection (stopped, walking, jogging,
//      easy running, fast, sprint), only if the alternation is clear.
// The type of each segment (sprint, jogging, walking) is always measured on
// the data, relative to the athlete's easy pace. Pure functions.

import type { GpsPoint, HrPoint, WorkoutStepInput, WorkoutStepKind, WorkoutType } from "@/lib/types";
import { cumulativeDistance } from "./geo.ts";
import { formatStepAmount, groupWorkoutSteps } from "../workout-guide.ts";
import { detectPauses } from "./pauses.ts";

// 3: segments measured on moving time (watch pauses excluded).
// 4: laps that match the plan, warm-up and cool-down optional,
//    standing stops as pauses, cadence per segment.
// 5: with a long run, an easy run or a recovery in the plan, automatic detection
//    counts only if the pattern is clear (no repeats from GPS noise).
export const INTERVALS_VERSION = 5;

/** Cumulative distance recorded by the watch (m) at t seconds from the start. */
export interface DistancePoint {
  t: number;
  d: number;
}

/** FIT file lap, already relative to the start of the activity. */
export interface FitLap {
  start_s: number;
  duration_s: number;
  distance_m: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  /** FIT intensity: active, rest, warmup, cooldown, recovery, interval… */
  intensity: string | null;
  /** FIT lap_trigger: manual, distance, time, session_end… */
  trigger: string | null;
  /** Index of the guided workout step, if the watch was following it. */
  step: number | null;
}

export type IntervalSource = "laps" | "notes" | "plan" | "auto";

/** How a segment was run: sprint, jogging recovery, walking, or standing still. */
export type SegmentVariant = "sprint" | "jog" | "walk" | "stop";

export interface IntervalSegment {
  kind: WorkoutStepKind;
  variant: SegmentVariant | null;
  label: string;
  start_s: number;
  duration_s: number;
  distance_m: number | null;
  pace_s_km: number | null;
  /** Top speed (3 s average), useful for sprints. */
  max_speed_kmh: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  /** Average cadence while moving (steps per minute). */
  cadence_spm?: number | null;
  /** Seconds paused inside the segment: not in the duration or the pace. */
  paused_s?: number;
  /** Heartbeats recovered during a recovery (start − end). */
  hr_drop: number | null;
  /** Duration or distance expected by the structure. */
  target: { type: "time" | "distance"; value: number } | null;
  target_pace: { min: number | null; max: number | null } | null;
  /** Deviation from the expected pace range: negative = faster. */
  pace_deviation_s: number | null;
  /** Repetition number among identical segments (e.g. 2 of 5). */
  rep: number | null;
  reps: number | null;
}

export interface IntervalSummary {
  /** What the main summary is computed on: fast segments or, if only those exist, sprints. */
  main: "work" | "sprint";
  /** Fast segments (excluding sprints, which have their own summary). */
  work_count: number;
  avg_pace_s_km: number | null;
  fastest_pace_s_km: number | null;
  slowest_pace_s_km: number | null;
  /** Last vs first identical repeat, in %: positive = drop. */
  fade_pct: number | null;
  avg_hr: number | null;
  sprint: { count: number; avg_pace_s_km: number | null; max_speed_kmh: number | null } | null;
}

export interface IntervalAnalysis {
  version: number;
  source: IntervalSource | "none";
  description: string | null;
  segments: IntervalSegment[];
  summary: IntervalSummary | null;
  /** Structure read from the note: kept saved because the note gets cleared. */
  declared?: { steps: WorkoutStepInput[]; description: string | null } | null;
  /** The plan asked for a continuous run, but the data shows clear repeats. */
  contradicts_plan?: ContinuousType | null;
}

export interface DeclaredStructure {
  source: "notes" | "plan";
  steps: WorkoutStepInput[];
  description?: string | null;
}

export interface AnalyzeInput {
  distance?: DistancePoint[] | null;
  gps?: GpsPoint[] | null;
  hr?: HrPoint[] | null;
  /** FIT cadence of the run (rpm = steps per minute / 2). */
  cadence?: Array<{ t: number; rpm: number }> | null;
  laps?: FitLap[] | null;
  /** Declared structures, from the most reliable (note) to the least (plan). */
  structures?: DeclaredStructure[];
  /** Type of the matched plan session, even if it has no structure. */
  planned?: WorkoutType | null;
}

// ── Thresholds ───────────────────────────────────────────────────────────────

/** Below this average speed you are stopped (m/s). */
const STOP_SPEED = 0.45;
/** Below ≈ 9:00/km you are walking, if cadence is missing (m/s). */
const WALK_SPEED = 1.85;
/** Below this cadence you are walking (steps per minute). */
const WALK_CADENCE = 140;
/** Relative to easy pace: above is "fast", below is "jogging". */
const FAST_RATIO = 1.15;
const JOG_RATIO = 0.88;
/** A sprint is short. */
const SPRINT_MAX_S = 75;
/** Stopped at least this long (with the watch recording) is a pause. */
const STILL_MIN_S = 10;
/** Warm-up or cool-down shorter than this were not run. */
const EDGE_MIN_S = 30;
/** Final lap shorter than this: it is the end of the activity, not a segment. */
const STUB_LAP_S = 15;
/** Lap and step match if the duration (or distance) differs by at most this much. */
const LAP_MATCH_RATIO = 0.06;

export const VARIANT_LABELS: Record<SegmentVariant, string> = {
  sprint: "Sprint",
  jog: "Jogging",
  walk: "Camminata",
  stop: "Fermo",
};

const STEP_LABELS: Record<WorkoutStepKind, string> = {
  warmup: "Riscaldamento",
  work: "Veloce",
  recovery: "Recupero",
  steady: "Continuo",
  cooldown: "Defaticamento",
};

const GENERIC_LABEL = /^(recupero|rec\b|veloce|ripetut|tratto|riscaldamento|defaticamento|corsa|continuo|lavoro|allenamento)/i;
const SPRINT_LABEL = /sprint|allung|scatt|volat/i;

// ── 1-second series ──────────────────────────────────────────────────────────

interface Timeline {
  t0: number;
  n: number;
  dist: Float64Array;
  speed: Float64Array;
  hr: Float64Array;
  /** Steps per minute; NaN where missing. */
  cadence: Float64Array;
  /** 1 in paused seconds (watch stopped or athlete stopped): they count neither in time nor in pace. */
  paused: Uint8Array;
  /** Cumulative sum of `paused`: pausedBefore[i] = seconds paused before i. */
  pausedBefore: Int32Array;
}

const MAX_SECONDS = 6 * 3600;

function resampleDistance(points: Array<{ t: number; d: number }>, t0: number, n: number): Float64Array {
  const out = new Float64Array(n);
  let k = 0;
  for (let i = 0; i < n; i++) {
    const t = t0 + i;
    while (k + 1 < points.length && points[k + 1].t <= t) k++;
    const a = points[k];
    const b = points[k + 1];
    if (!b || t <= a.t) out[i] = a.d;
    // Pause (watch stopped, distance almost still): stays still until
    // resume. A gap with distance covered is just sparse sampling.
    else if (b.t - a.t > 10 && (b.d - a.d) / (b.t - a.t) < STOP_SPEED) out[i] = a.d;
    else out[i] = a.d + ((b.d - a.d) * (t - a.t)) / (b.t - a.t);
  }
  return out;
}

/** Interpolates a sparse series onto seconds; gaps beyond `maxGap` stay NaN. */
function resampleValues(points: Array<{ t: number; v: number }>, t0: number, n: number, maxGap: number, hold: number): Float64Array {
  const out = new Float64Array(n).fill(Number.NaN);
  if (!points.length) return out;
  const sorted = [...points].sort((a, b) => a.t - b.t);
  let k = 0;
  for (let i = 0; i < n; i++) {
    const t = t0 + i;
    while (k + 1 < sorted.length && sorted[k + 1].t <= t) k++;
    const a = sorted[k];
    const b = sorted[k + 1];
    if (t < a.t) {
      if (a.t - t <= hold) out[i] = a.v;
    } else if (b && b.t - a.t <= maxGap) {
      out[i] = a.v + ((b.v - a.v) * (t - a.t)) / (b.t - a.t);
    } else if (t - a.t <= hold) {
      out[i] = a.v;
    }
  }
  return out;
}

/**
 * Moving average of positions (±3 points): GPS zig-zag inflates
 * distance especially when going slowly, and a walk would look like jogging.
 */
function smoothTrack(gps: GpsPoint[]): GpsPoint[] {
  const half = 3;
  return gps.map((point, i) => {
    let lat = 0;
    let lon = 0;
    let count = 0;
    for (let k = Math.max(0, i - half); k <= Math.min(gps.length - 1, i + half); k++) {
      // Only points close in time: a pause must not be averaged with the resume.
      if (Math.abs(gps[k].t - point.t) > half * 3) continue;
      lat += gps[k].lat;
      lon += gps[k].lon;
      count++;
    }
    return { ...point, lat: lat / count, lon: lon / count };
  });
}

function buildTimeline(input: AnalyzeInput): Timeline | null {
  let points: Array<{ t: number; d: number }>;
  let half: number;
  if (input.distance && input.distance.length >= 10) {
    points = input.distance.filter((p) => Number.isFinite(p.t) && Number.isFinite(p.d)).map((p) => ({ t: p.t, d: p.d }));
    // Watch distance: already filtered, a short window is enough.
    half = 2;
  } else if (input.gps && input.gps.length >= 10) {
    const gps = smoothTrack([...input.gps].sort((a, b) => a.t - b.t));
    const cum = cumulativeDistance(gps);
    points = gps.map((p, i) => ({ t: p.t, d: cum[i] }));
    // Noisy GPS: wider window.
    half = 4;
  } else {
    return null;
  }
  points.sort((a, b) => a.t - b.t);
  points = points.filter((p, i) => i === 0 || p.t > points[i - 1].t);
  if (points.length < 10) return null;
  const t0 = Math.round(points[0].t);
  const n = Math.min(MAX_SECONDS, Math.round(points[points.length - 1].t) - t0 + 1);
  if (n < 60) return null;
  const dist = resampleDistance(points, t0, n);
  const speed = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - half);
    const b = Math.min(n - 1, i + half);
    speed[i] = b > a ? Math.max(0, (dist[b] - dist[a]) / (b - a)) : 0;
  }
  // HR: the sensor loses signal at times; up to a minute is interpolated.
  const hr = resampleValues((input.hr ?? []).filter((p) => p.bpm > 0).map((p) => ({ t: p.t, v: p.bpm })), t0, n, 60, 20);
  const cadence = resampleValues((input.cadence ?? []).filter((p) => p.rpm > 0).map((p) => ({ t: p.t, v: p.rpm * 2 })), t0, n, 15, 5);
  // Watch pauses: they stay on the timeline (a standing recovery
  // stays a recovery) but their seconds don't enter the segment pace.
  const paused = new Uint8Array(n);
  for (const pause of detectPauses(points)) {
    const to = Math.min(n, Math.round(pause.to) - t0);
    for (let i = Math.max(0, to - Math.round(pause.removed)); i < to; i++) paused[i] = 1;
  }
  // Stops with the watch recording (traffic light, waiting): count as pauses.
  for (let i = 0; i < n;) {
    if (speed[i] >= STOP_SPEED) {
      i++;
      continue;
    }
    let j = i;
    while (j < n && speed[j] < STOP_SPEED) j++;
    if (j - i >= STILL_MIN_S) paused.fill(1, i, j);
    i = j;
  }
  const pausedBefore = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) pausedBefore[i + 1] = pausedBefore[i] + paused[i];
  return { t0, n, dist, speed, hr, cadence, paused, pausedBefore };
}

/** Seconds moving between start and end (pauses excluded). */
function movingSeconds(tl: Timeline, start: number, end: number): number {
  const a = Math.max(0, Math.min(tl.n, start));
  const b = Math.max(a, Math.min(tl.n, end));
  return b - a - (tl.pausedBefore[b] - tl.pausedBefore[a]);
}

/**
 * Average speed over total time, stops included: to recognise segments
 * without a declared structure (automatic detection, recovery type), where
 * standing still is exactly what distinguishes a recovery.
 */
function elapsedSpeed(tl: Timeline, start: number, end: number): number {
  if (end <= start) return 0;
  return (tl.dist[Math.min(end, tl.n - 1)] - tl.dist[start]) / (end - start);
}

/** Average speed while moving: a pause inside the segment doesn't slow it. */
function meanSpeed(tl: Timeline, start: number, end: number): number {
  if (end <= start) return 0;
  const moving = movingSeconds(tl, start, end);
  if (moving < 1) return 0;
  return (tl.dist[Math.min(end, tl.n - 1)] - tl.dist[start]) / moving;
}

function meanOf(values: Float64Array, start: number, end: number): number | null {
  let sum = 0;
  let count = 0;
  for (let i = start; i < end; i++) {
    if (!Number.isNaN(values[i])) {
      sum += values[i];
      count++;
    }
  }
  return count ? sum / count : null;
}

function mean(values: number[]): number | null {
  return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * Reference easy pace: the 30th percentile of speed while
 * running (walks and stops excluded). Between warm-up, jogging and fast segments
 * it falls on the pace of the easy run.
 */
function easySpeed(tl: Timeline): number | null {
  const running: number[] = [];
  for (let i = 0; i < tl.n; i++) {
    const cad = tl.cadence[i];
    if (tl.speed[i] >= WALK_SPEED && (Number.isNaN(cad) || cad >= WALK_CADENCE)) running.push(tl.speed[i]);
  }
  if (running.length < 120) return null;
  running.sort((a, b) => a - b);
  return running[Math.floor(running.length * 0.3)];
}

/** Measured recovery: stopped, walking or jogging. */
function restVariant(tl: Timeline, start: number, end: number): SegmentVariant {
  const v = elapsedSpeed(tl, start, end);
  if (v < STOP_SPEED) return "stop";
  const cad = meanOf(tl.cadence, start, end);
  if (cad != null ? cad < WALK_CADENCE : v < WALK_SPEED) return "walk";
  return "jog";
}

// ── Segments ─────────────────────────────────────────────────────────────────

interface Span {
  start: number;
  end: number;
  kind: WorkoutStepKind;
  variant?: SegmentVariant | null;
  label: string;
  step?: WorkoutStepInput;
  /** Values measured by the watch (laps), more precise than the series. */
  lap?: FitLap;
}

/**
 * Measured type of each segment: recoveries become jogging, walking or
 * stop; short fast segments clearly faster than the others (or
 * declared as such) become sprints. Generic labels follow.
 */
function refineVariants(tl: Timeline, spans: Span[]): Span[] {
  const base = easySpeed(tl);
  const work = spans.filter((s) => s.kind === "work");
  const longWork = work.filter((s) => s.end - s.start > SPRINT_MAX_S).map((s) => elapsedSpeed(tl, s.start, s.end));
  const reference = median(longWork);
  return spans.map((span) => {
    const out = { ...span };
    const declared = span.step?.variant ?? null;
    if (span.kind === "recovery") {
      out.variant = restVariant(tl, span.start, span.end);
      out.label = VARIANT_LABELS[out.variant];
    } else if (span.kind === "work") {
      const duration = span.end - span.start;
      const v = elapsedSpeed(tl, span.start, span.end);
      const fastest = (reference != null && v >= reference * 1.08) ||
        (reference == null && base != null && v >= base * 1.3) ||
        (base != null && v >= base * 1.5);
      const sprint = declared === "sprint" || SPRINT_LABEL.test(span.label) || (duration <= SPRINT_MAX_S && fastest);
      out.variant = sprint ? "sprint" : null;
      if (sprint && (!span.label || GENERIC_LABEL.test(span.label))) out.label = VARIANT_LABELS.sprint;
    } else if (span.kind === "warmup" || span.kind === "cooldown") {
      // Walked warm-up or cool-down: you can tell from the colour.
      const variant = restVariant(tl, span.start, span.end);
      out.variant = variant === "jog" ? null : variant;
    }
    if (!out.label) out.label = STEP_LABELS[out.kind];
    // Before the strides there was a whole run, not a warm-up.
    if ((span.kind === "warmup" || span.kind === "cooldown") && span.end - span.start > 1200 && GENERIC_LABEL.test(out.label)) out.label = "Corsa facile";
    return out;
  });
}

/**
 * Recoveries broken up by transition fragments: consecutive ones
 * of the same type are merged and those of a few seconds go to the longer neighbour.
 * Laps stay as the watch recorded them.
 */
function tidyRecoveries(spans: Span[]): Span[] {
  const out: Span[] = [];
  for (const span of spans) {
    const previous = out[out.length - 1];
    const joinable = previous && !previous.lap && !span.lap && previous.kind === "recovery" && span.kind === "recovery" && !previous.step && !span.step;
    if (joinable && (previous.variant === span.variant || span.end - span.start < 10 || previous.end - previous.start < 10)) {
      if (previous.end - previous.start < span.end - span.start) {
        previous.variant = span.variant;
        previous.label = span.label;
      }
      previous.end = span.end;
      continue;
    }
    out.push({ ...span });
  }
  return out;
}

function paceDeviation(pace: number, min: number | null, max: number | null): number {
  if (min != null && pace < min) return pace - min;
  if (max != null && pace > max) return pace - max;
  return 0;
}

function hrStats(tl: Timeline, start: number, end: number) {
  const values: number[] = [];
  for (let i = start; i < end; i++) if (!Number.isNaN(tl.hr[i])) values.push(tl.hr[i]);
  return {
    avg: values.length ? Math.round(mean(values)!) : null,
    max: values.length ? Math.round(Math.max(...values)) : null,
    first: meanOf(tl.hr, start, Math.min(end, start + 5)),
    last: meanOf(tl.hr, Math.max(start, end - 5), end),
  };
}

function topSpeed(tl: Timeline, start: number, end: number): number | null {
  let best = 0;
  for (let i = start; i + 3 <= end; i++) best = Math.max(best, (tl.dist[Math.min(i + 3, tl.n - 1)] - tl.dist[i]) / 3);
  return best > 0 ? Math.round(best * 36) / 10 : null;
}

function measure(tl: Timeline, span: Span): IntervalSegment {
  const start = Math.max(0, Math.min(tl.n - 1, span.start));
  const end = Math.max(start + 1, Math.min(tl.n, span.end));
  const elapsed = span.lap?.duration_s ?? end - start;
  const pausedSeconds = Math.min(elapsed, end - start - movingSeconds(tl, start, end));
  // Moving time: pauses count neither in duration nor in pace.
  const moving = Math.max(1, elapsed - pausedSeconds);
  // Segment entirely stationary (recovery in pause): lasts as long as the stop.
  const stillOnly = elapsed - pausedSeconds < 5;
  const duration = stillOnly ? elapsed : moving;
  let cadenceSum = 0;
  let cadenceCount = 0;
  for (let i = start; i < end; i++) {
    if (tl.paused[i] || Number.isNaN(tl.cadence[i])) continue;
    cadenceSum += tl.cadence[i];
    cadenceCount++;
  }
  const cadence = cadenceCount >= Math.min(10, (end - start) / 2) && cadenceCount > 0 ? Math.round(cadenceSum / cadenceCount) : null;
  const seriesDistance = tl.dist[Math.min(end, tl.n - 1)] - tl.dist[start];
  const distance = span.lap?.distance_m ?? seriesDistance;
  const pace = distance >= 30 ? Math.round((moving / distance) * 1000) : null;
  const validPace = pace != null && pace >= 120 && pace <= 1_500 ? pace : null;
  const hr = hrStats(tl, start, end);
  const step = span.step;
  const targetPace = step && (step.pace_min_s_km != null || step.pace_max_s_km != null)
    ? { min: step.pace_min_s_km, max: step.pace_max_s_km }
    : null;
  return {
    kind: span.kind,
    variant: span.variant ?? null,
    label: span.label,
    start_s: tl.t0 + start,
    duration_s: Math.round(duration),
    distance_m: distance > 0 ? Math.round(distance) : null,
    pace_s_km: validPace,
    max_speed_kmh: span.kind === "work" ? topSpeed(tl, start, end) : null,
    avg_hr: span.lap?.avg_hr ?? hr.avg,
    max_hr: span.lap?.max_hr ?? hr.max,
    cadence_spm: stillOnly ? null : cadence,
    paused_s: stillOnly ? 0 : Math.round(pausedSeconds),
    hr_drop: span.kind === "recovery" && hr.first != null && hr.last != null ? Math.round(hr.first - hr.last) : null,
    target: step && step.completion_type !== "manual" && step.completion_value
      ? { type: step.completion_type, value: step.completion_value }
      : null,
    target_pace: targetPace,
    pace_deviation_s: targetPace && validPace != null ? paceDeviation(validPace, targetPace.min, targetPace.max) : null,
    rep: null,
    reps: null,
  };
}

/**
 * "Identical" segments for numbering repeats: same type, variant,
 * label and target. Without a target (laps, automatic detection) the
 * duration counts too, in 25% steps.
 */
function signature(segment: IntervalSegment): string {
  const shape = segment.target
    ? `${segment.target.type}:${segment.target.value}`
    : `~${Math.round(Math.log(Math.max(1, segment.duration_s)) / Math.log(1.25))}`;
  return [segment.kind, segment.variant ?? "", segment.label, shape].join("|");
}

function paceStats(list: IntervalSegment[]) {
  const timed = list.filter((s) => s.pace_s_km != null && s.distance_m);
  const meters = timed.reduce((sum, s) => sum + s.distance_m!, 0);
  const seconds = timed.reduce((sum, s) => sum + s.duration_s, 0);
  const paces = timed.map((s) => s.pace_s_km!);
  return {
    avg: meters > 0 ? Math.round((seconds / meters) * 1000) : null,
    fastest: paces.length ? Math.min(...paces) : null,
    slowest: paces.length ? Math.max(...paces) : null,
  };
}

/** Numbers the repeats of identical segments and computes the summary. */
function finalize(segments: IntervalSegment[], source: IntervalSource, description: string | null): IntervalAnalysis {
  const groups = new Map<string, IntervalSegment[]>();
  for (const segment of segments) {
    if (segment.kind === "warmup" || segment.kind === "cooldown") continue;
    const key = signature(segment);
    groups.set(key, [...(groups.get(key) ?? []), segment]);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    group.forEach((segment, index) => {
      segment.rep = index + 1;
      segment.reps = group.length;
    });
  }

  const sprints = segments.filter((s) => s.kind === "work" && s.variant === "sprint");
  const fast = segments.filter((s) => s.kind === "work" && s.variant !== "sprint");
  // Without "normal" fast segments the main summary is the sprints one.
  const main = fast.length ? fast : sprints;
  const stats = paceStats(main);
  const repeated = [...groups.values()]
    .filter((group) => group[0].kind === "work" && main.includes(group[0]) && group.length >= 3)
    .sort((a, b) => b.length - a.length)[0];
  const first = repeated?.[0]?.pace_s_km;
  const last = repeated?.[repeated.length - 1]?.pace_s_km;
  const hrs = main.map((s) => s.avg_hr).filter((v): v is number => v != null);
  const sprintStats = paceStats(sprints);
  const topSpeeds = sprints.map((s) => s.max_speed_kmh).filter((v): v is number => v != null);
  return {
    version: INTERVALS_VERSION,
    source,
    description,
    segments,
    summary: main.length
      ? {
          main: fast.length ? "work" : "sprint",
          work_count: main.length,
          avg_pace_s_km: stats.avg,
          fastest_pace_s_km: stats.fastest,
          slowest_pace_s_km: stats.slowest,
          fade_pct: first && last ? Math.round(((last - first) / first) * 1000) / 10 : null,
          avg_hr: hrs.length ? Math.round(mean(hrs)!) : null,
          sprint: sprints.length && fast.length
            ? { count: sprints.length, avg_pace_s_km: sprintStats.avg, max_speed_kmh: topSpeeds.length ? Math.max(...topSpeeds) : null }
            : null,
        }
      : null,
  };
}

// ── Tiered classification (laps without intensity and automatic detection) ─

type Level = "stop" | "walk" | "jog" | "easy" | "fast";

function levelOf(tl: Timeline, start: number, end: number, base: number): Level {
  const v = elapsedSpeed(tl, start, end);
  if (v < STOP_SPEED) return "stop";
  const cad = meanOf(tl.cadence, start, end);
  if (cad != null ? cad < WALK_CADENCE : v < WALK_SPEED) return "walk";
  if (v >= base * FAST_RATIO) return "fast";
  if (v <= base * JOG_RATIO) return "jog";
  return "easy";
}

/**
 * From classified pieces to segments: before the first effort is warm-up,
 * after the last cool-down, in between recoveries (jogging, walking, stop).
 */
function levelsToSpans(pieces: Array<{ start: number; end: number; level: Level; lap?: FitLap }>, mergeSame: boolean): Span[] | null {
  const merged: typeof pieces = [];
  for (const piece of pieces) {
    const last = merged[merged.length - 1];
    if (mergeSame && last && last.level === piece.level) last.end = piece.end;
    else merged.push({ ...piece });
  }
  const firstEffort = merged.findIndex((p) => p.level === "fast");
  if (firstEffort < 0) return null;
  let lastEffort = merged.length - 1;
  while (merged[lastEffort].level !== "fast") lastEffort--;
  const spans: Span[] = [];
  merged.forEach((piece, index) => {
    let kind: WorkoutStepKind;
    if (index < firstEffort) kind = "warmup";
    else if (index > lastEffort) kind = "cooldown";
    else kind = piece.level === "fast" ? "work" : "recovery";
    const previous = spans[spans.length - 1];
    // A warm-up (or cool-down) with several paces stays a single segment.
    if (mergeSame && previous && previous.kind === kind && (kind === "warmup" || kind === "cooldown")) {
      previous.end = piece.end;
      return;
    }
    spans.push({ start: piece.start, end: piece.end, kind, label: "", lap: piece.lap });
  });
  return spans;
}

/** Optimal segmentation with a free number of segments (penalty for each change). */
function partition(tl: Timeline): Array<[number, number]> {
  const factor = Math.max(3, Math.ceil(tl.n / 1200));
  const m = Math.ceil(tl.n / factor);
  const block = new Float64Array(m);
  for (let b = 0; b < m; b++) block[b] = elapsedSpeed(tl, b * factor, Math.min(tl.n, (b + 1) * factor));
  // Noise estimated from differences between nearby blocks (robust to pace changes).
  const diffs: number[] = [];
  for (let b = 1; b < m; b++) diffs.push(Math.abs(block[b] - block[b - 1]));
  const sigma = Math.max(0.08, (1.4826 * (median(diffs) ?? 0.1)) / Math.SQRT2);
  const s1 = new Float64Array(m + 1);
  const s2 = new Float64Array(m + 1);
  for (let b = 0; b < m; b++) {
    s1[b + 1] = s1[b] + block[b];
    s2[b + 1] = s2[b] + block[b] ** 2;
  }
  const cost = (i: number, j: number) => {
    const sum = s1[j] - s1[i];
    return Math.max(0, s2[j] - s2[i] - (sum * sum) / (j - i)) / (sigma * sigma);
  };
  const penalty = 3 * Math.log(m);
  const minLen = Math.max(1, Math.round(8 / factor));
  const best = new Float64Array(m + 1).fill(Number.POSITIVE_INFINITY);
  const from = new Int32Array(m + 1).fill(-1);
  best[0] = -penalty;
  for (let j = minLen; j <= m; j++) {
    for (let i = 0; i <= j - minLen; i++) {
      if (best[i] === Number.POSITIVE_INFINITY) continue;
      const value = best[i] + cost(i, j) + penalty;
      if (value < best[j]) {
        best[j] = value;
        from[j] = i;
      }
    }
  }
  const cuts: number[] = [];
  for (let j = m; j > 0; j = from[j]) {
    if (from[j] < 0) break;
    cuts.unshift(j);
  }
  const bounds = [0, ...cuts].map((b) => Math.min(tl.n, b * factor));
  bounds[bounds.length - 1] = tl.n;
  return refineBounds(tl, bounds, factor).slice(1).map((end, i, all) => [i === 0 ? 0 : all[i - 1], end]);
}

/** Refines the boundaries to the second, within ± one block. */
function refineBounds(tl: Timeline, bounds: number[], radius: number): number[] {
  const s1 = new Float64Array(tl.n + 1);
  const s2 = new Float64Array(tl.n + 1);
  for (let i = 0; i < tl.n; i++) {
    s1[i + 1] = s1[i] + tl.speed[i];
    s2[i + 1] = s2[i] + tl.speed[i] ** 2;
  }
  const sse = (i: number, j: number) => (j <= i ? 0 : s2[j] - s2[i] - (s1[j] - s1[i]) ** 2 / (j - i));
  const out = [...bounds];
  for (let k = 1; k < out.length - 1; k++) {
    let bestAt = out[k];
    let bestCost = Number.POSITIVE_INFINITY;
    for (let b = Math.max(out[k - 1] + 1, out[k] - radius); b <= Math.min(out[k + 1] - 1, out[k] + radius); b++) {
      const c = sse(out[k - 1], b) + sse(b, out[k + 1]);
      if (c < bestCost) {
        bestCost = c;
        bestAt = b;
      }
    }
    out[k] = bestAt;
  }
  return out;
}

/**
 * Automatic detection: true fast segments only if between one effort and the next
 * there is a clear recovery (slow jogging, walking, stop) or if they are much
 * faster than easy pace (sprints, strides). This way the ups and downs of
 * an easy run don't become repeats.
 */
function autoSpans(tl: Timeline): Span[] | null {
  const base = easySpeed(tl);
  if (!base) return null;
  const pieces = partition(tl).map(([start, end]) => ({ start, end, level: levelOf(tl, start, end, base) }));
  const spans = levelsToSpans(pieces, true);
  if (!spans) return null;
  const efforts = spans.filter((s) => s.kind === "work");
  if (efforts.length < 2) return null;
  const effortTime = efforts.reduce((sum, s) => sum + s.end - s.start, 0);
  if (effortTime > tl.n * 0.8) return null;
  const effortSpeed = efforts.reduce((sum, s) => sum + elapsedSpeed(tl, s.start, s.end) * (s.end - s.start), 0) / effortTime;
  const gaps = spans.filter((s) => s.kind === "recovery");
  const clearRest = gaps.filter((s) => elapsedSpeed(tl, s.start, s.end) <= base * 0.85).length;
  if (clearRest < Math.ceil((efforts.length - 1) / 2) && effortSpeed < base * 1.3) return null;
  return spans;
}

// ── 1. FIT file laps ─────────────────────────────────────────────────────────

const LAP_KINDS: Record<string, WorkoutStepKind> = {
  warmup: "warmup",
  cooldown: "cooldown",
  rest: "recovery",
  recovery: "recovery",
  interval: "work",
  active: "work",
};

const AUTO_TRIGGERS = new Set(["distance", "time", "positionStart", "positionLap", "positionWaypoint", "positionMarked"]);

/** Automatic laps at fixed distance or time: they say nothing about the structure. */
export function areAutoLaps(laps: FitLap[]): boolean {
  // Guided workout on the watch: laps close on time or distance but
  // follow the steps (index and intensity), so they are the true structure.
  if (new Set(laps.map((lap) => lap.step).filter((step) => step != null)).size >= 2) return false;
  if (laps.some((lap) => lap.intensity && lap.intensity !== "active")) return false;
  const body = laps.slice(0, -1);
  if (!body.length) return true;
  if (body.some((lap) => lap.trigger === "manual")) return false;
  if (body.every((lap) => lap.trigger != null && AUTO_TRIGGERS.has(lap.trigger))) return true;
  const distances = body.map((lap) => lap.distance_m ?? 0);
  const ref = distances[0];
  return ref > 0 && distances.every((d) => Math.abs(d - ref) / ref < 0.03);
}

/**
 * The final lap of a few seconds (end of the activity after the last segment)
 * merges with the previous one: it is not a segment on its own.
 */
export function withoutStubLap(laps: FitLap[]): FitLap[] {
  if (laps.length < 2) return laps;
  const last = laps[laps.length - 1];
  if (last.duration_s >= STUB_LAP_S) return laps;
  const previous = laps[laps.length - 2];
  return [
    ...laps.slice(0, -2),
    {
      ...previous,
      duration_s: previous.duration_s + last.duration_s,
      distance_m: previous.distance_m != null ? previous.distance_m + (last.distance_m ?? 0) : null,
      max_hr: Math.max(previous.max_hr ?? 0, last.max_hr ?? 0) || null,
    },
  ];
}

function locateLaps(laps: FitLap[], tl: Timeline) {
  return laps.map((lap) => {
    const start = Math.max(0, Math.round(lap.start_s - tl.t0));
    return { lap, start, end: Math.min(tl.n, start + Math.round(lap.duration_s)) };
  });
}

/**
 * Fast-segment threshold derived from the laps themselves: splits the run laps into two
 * speed groups (weighted by duration) and keeps it only if the two groups are
 * clearly different. Needed when almost the whole run is at a sustained pace and
 * the easy pace estimated on the series falls too high.
 */
function lapFastThreshold(speeds: Array<{ v: number; w: number }>): number | null {
  const sorted = speeds.filter((s) => s.w > 0).sort((a, b) => a.v - b.v);
  if (sorted.length < 2) return null;
  let best: { score: number; threshold: number; ratio: number } | null = null;
  for (let k = 1; k < sorted.length; k++) {
    const low = sorted.slice(0, k);
    const high = sorted.slice(k);
    const wl = low.reduce((sum, s) => sum + s.w, 0);
    const wh = high.reduce((sum, s) => sum + s.w, 0);
    const ml = low.reduce((sum, s) => sum + s.v * s.w, 0) / wl;
    const mh = high.reduce((sum, s) => sum + s.v * s.w, 0) / wh;
    const score = wl * wh * (mh - ml) ** 2;
    if (!best || score > best.score) best = { score, threshold: (sorted[k - 1].v + sorted[k].v) / 2, ratio: mh / ml };
  }
  return best && best.ratio >= FAST_RATIO ? best.threshold : null;
}

function lapSpans(rawLaps: FitLap[], tl: Timeline): Span[] | null {
  const laps = withoutStubLap(rawLaps);
  if (laps.length < 3 || areAutoLaps(laps)) return null;
  const located = locateLaps(laps, tl);
  const hasIntensity = laps.some((lap) => lap.intensity && lap.intensity !== "active");
  if (hasIntensity) {
    const spans = located.map(({ lap, start, end }): Span => ({ start, end, kind: LAP_KINDS[lap.intensity ?? "active"] ?? "work", label: "", lap }));
    return spans.some((span) => span.kind === "work") ? spans : null;
  }
  // Manually pressed laps: each lap is classified on pace, in several tiers.
  const base = easySpeed(tl);
  if (!base) return null;
  const pieces = located.map(({ lap, start, end }) => ({ start, end, lap, level: levelOf(tl, start, end, base) }));
  const running = pieces.filter((p) => p.level !== "stop" && p.level !== "walk");
  const threshold = lapFastThreshold(running.map((p) => ({ v: meanSpeed(tl, p.start, p.end), w: movingSeconds(tl, p.start, p.end) })));
  if (threshold != null) {
    for (const piece of running) {
      const v = meanSpeed(tl, piece.start, piece.end);
      piece.level = v >= threshold ? "fast" : v <= base * JOG_RATIO ? "jog" : "easy";
    }
  }
  return levelsToSpans(pieces, false);
}

/** Does the lap have the step's duration (or distance)? Warm-up, cool-down and free steps always fit. */
function lapFitsStep(lap: FitLap, step: WorkoutStepInput): boolean {
  if (step.kind === "warmup" || step.kind === "cooldown") return true;
  const value = step.completion_value ?? 0;
  if (step.completion_type === "manual" || value <= 0) return true;
  if (step.completion_type === "time") return Math.abs(lap.duration_s - value) <= Math.max(4, value * LAP_MATCH_RATIO);
  if (lap.distance_m == null) return false;
  return Math.abs(lap.distance_m - value) <= Math.max(25, value * LAP_MATCH_RATIO);
}

/**
 * Laps that follow the declared session: the watch closed a lap at each
 * step (guided workout or laps pressed at the change). An unwritten or
 * skipped warm-up or cool-down and a session ended
 * early are accepted, as long as almost all fixed-duration or distance segments match.
 */
function matchLapsToSteps(rawLaps: FitLap[], steps: WorkoutStepInput[], tl: Timeline): Span[] | null {
  const laps = withoutStubLap(rawLaps);
  if (laps.length < 3 || !steps.length) return null;
  const located = locateLaps(laps, tl);
  const fixed = (step: WorkoutStepInput) =>
    step.kind !== "warmup" && step.kind !== "cooldown" && step.completion_type !== "manual" && (step.completion_value ?? 0) > 0;
  // Start: from the first step, or skipping the declared warm-up.
  const firstOptions = steps[0].kind === "warmup" ? [0, 1] : [0];
  for (const first of firstOptions) {
    // An extra lap at the start acts as warm-up if the plan doesn't write one.
    for (const leading of steps[first]?.kind === "warmup" ? [0] : [0, 1]) {
      const spans: Span[] = [];
      let s = first;
      let ok = true;
      let matchedFixed = 0;
      located.forEach(({ lap, start, end }, index) => {
        if (!ok) return;
        if (index < leading) {
          spans.push({ start, end, kind: "warmup", label: STEP_LABELS.warmup, lap });
          return;
        }
        const step = steps[s];
        if (step && lapFitsStep(lap, step)) {
          if (fixed(step)) matchedFixed++;
          spans.push({ start, end, kind: step.kind, label: step.label?.trim() || STEP_LABELS[step.kind], step, lap });
          s++;
          return;
        }
        // An extra lap at the end: unwritten cool-down.
        if (index === located.length - 1 && (!step || step.kind === "cooldown")) {
          spans.push({ start, end, kind: "cooldown", label: step?.label?.trim() || STEP_LABELS.cooldown, step, lap });
          s++;
          return;
        }
        ok = false;
      });
      if (!ok) continue;
      // Steps left without a lap: only if the session was interrupted after
      // most of the work (e.g. cool-down not done).
      const remainingFixed = steps.slice(s).filter(fixed).length;
      const totalFixed = steps.filter(fixed).length;
      if (matchedFixed < 2 || remainingFixed > Math.floor(totalFixed / 3)) continue;
      if (!spans.some((span) => span.kind === "work" || span.kind === "steady")) continue;
      return spans;
    }
  }
  return null;
}

// ── 2. Declared structure aligned on speed ───────────────────────────────────

interface TemplateEntry {
  kind: WorkoutStepKind;
  label: string;
  /** free = free duration (warm-up with no duration, undeclared pauses). */
  type: "time" | "distance" | "free";
  value: number;
  /** Cost per block of a free part: undeclared pauses cost a little. */
  freeCost: number;
  /** Declared warm-up/cool-down: indicative duration or distance, may go to zero. */
  soft?: { type: "time" | "distance"; value: number };
  step?: WorkoutStepInput;
}

function entryFor(step: WorkoutStepInput): TemplateEntry {
  // Warm-up and cool-down are often shortened or skipped: their
  // duration weighs little and can go to zero (otherwise they eat the last
  // repeat), but at the same pace as the rest it keeps the boundary near the expected one.
  const edge = step.kind === "warmup" || step.kind === "cooldown";
  const declared = step.completion_type !== "manual" && (step.completion_value ?? 0) > 0;
  const fixed = !edge && declared;
  return {
    kind: step.kind,
    label: step.label?.trim() || STEP_LABELS[step.kind],
    type: fixed ? step.completion_type as "time" | "distance" : "free",
    value: fixed ? step.completion_value! : 0,
    freeCost: 0,
    soft: edge && declared ? { type: step.completion_type as "time" | "distance", value: step.completion_value! } : undefined,
    step,
  };
}

const isEffort = (step: WorkoutStepInput) => step.kind === "work" || step.kind === "steady";

/**
 * Sequence to align: the declared steps (already expanded), plus free parts
 * at the start and end (unwritten warm-up/cool-down) and between two
 * consecutive effort segments, where the athlete may have recovered without saying so.
 */
function buildTemplate(steps: WorkoutStepInput[]): TemplateEntry[] {
  const free = (kind: WorkoutStepKind, cost: number): TemplateEntry => ({ kind, label: STEP_LABELS[kind], type: "free", value: 0, freeCost: cost });
  const out: TemplateEntry[] = [];
  if (steps[0]?.kind !== "warmup") out.push(free("warmup", 0));
  steps.forEach((step, index) => {
    const previous = steps[index - 1];
    if (previous && isEffort(previous) && isEffort(step)) out.push(free("recovery", 0.25));
    out.push(entryFor(step));
  });
  if (steps[steps.length - 1]?.kind !== "cooldown") out.push(free("cooldown", 0));
  return out;
}

const ALPHA = 2;
/** The measured distance is a certain datum (GPS or watch): a declared km must last about a km. */
const ALPHA_DISTANCE = 30;
/** Weight of the indicative duration of warm-up and cool-down (repeats weigh ALPHA). */
const EDGE_ALPHA = 0.3;
/** Warm-up or cool-down at least this fast relative to the adjacent repeat: it is the repeat. */
const EDGE_AS_EFFORT = 0.93;
/** Cost per pause block inside an effort: all else equal, the stop sits in the recovery. */
const PAUSE_IN_EFFORT_COST = 0.3;

/** Optimal segmentation: boundaries where speed changes, durations close to the declared ones. */
function alignTemplate(tl: Timeline, template: TemplateEntry[]): number[] | null {
  const factor = Math.max(1, Math.ceil(tl.n / 1500));
  const m = Math.ceil(tl.n / factor);
  // Each block weighs by its moving seconds: pauses have no speed,
  // so a stop mid-repeat doesn't look like a pace change.
  const speed = new Float64Array(m);
  const weight = new Float64Array(m);
  for (let b = 0; b < m; b++) {
    let sum = 0;
    let count = 0;
    let all = 0;
    for (let i = b * factor; i < Math.min(tl.n, (b + 1) * factor); i++) {
      all++;
      if (tl.paused[i]) continue;
      sum += tl.speed[i];
      count++;
    }
    speed[b] = count ? sum / count : 0;
    weight[b] = all ? count / all : 0;
  }
  const distAt = (block: number) => tl.dist[Math.min(tl.n - 1, block * factor)];
  const s0 = new Float64Array(m + 1);
  const s1 = new Float64Array(m + 1);
  const s2 = new Float64Array(m + 1);
  for (let b = 0; b < m; b++) {
    s0[b + 1] = s0[b] + weight[b];
    s1[b + 1] = s1[b] + weight[b] * speed[b];
    s2[b + 1] = s2[b] + weight[b] * speed[b] ** 2;
  }
  const avg = s0[m] > 0 ? s1[m] / s0[m] : 0;
  const variance = Math.max(0.04, s0[m] > 0 ? s2[m] / s0[m] - avg ** 2 : 0);
  const sse = (i: number, j: number) => {
    const w = s0[j] - s0[i];
    if (j <= i || w <= 0) return 0;
    const sum = s1[j] - s1[i];
    return Math.max(0, s2[j] - s2[i] - (sum * sum) / w) / variance;
  };

  const K = template.length;
  const INF = Number.POSITIVE_INFINITY;
  let prev = new Float64Array(m + 1).fill(INF);
  prev[0] = 0;
  const from: Int32Array[] = [];
  for (let k = 0; k < K; k++) {
    const entry = template[k];
    let lo: number;
    let hi: number;
    if (entry.type === "time") {
      const nominal = entry.value / factor;
      lo = Math.max(1, Math.floor(nominal * 0.5));
      hi = Math.max(lo, Math.ceil(nominal * 1.7));
    } else if (entry.type === "distance") {
      lo = Math.max(1, Math.floor(entry.value / 7.5 / factor));
      hi = Math.max(lo, Math.ceil(entry.value / 1.4 / factor));
    } else {
      lo = 0;
      hi = m;
    }
    // An undeclared pause is either real (at least 15 s) or absent.
    const minGap = entry.freeCost > 0 ? Math.ceil(15 / factor) : 0;
    const cur = new Float64Array(m + 1).fill(INF);
    const arg = new Int32Array(m + 1).fill(-1);
    for (let j = 0; j <= m; j++) {
      const maxLen = Math.min(hi, j);
      for (let len = lo; len <= maxLen; len++) {
        if (len > 0 && len < minGap) continue;
        const i = j - len;
        const base = prev[i];
        if (base === INF) continue;
        // Efforts measured on moving time; pauses at the boundary with a
        // recovery go to the recovery (there they are rest).
        const still = len - (s0[j] - s0[i]);
        const effort = entry.kind === "work" || entry.kind === "steady";
        const active = len - still;
        let prior: number;
        if (entry.type === "time") {
          const nominal = entry.value / factor;
          // A recovery may count the stop as rest or not: the closest one wins.
          const off = effort ? active - nominal : Math.min(Math.abs(len - nominal), Math.abs(active - nominal));
          prior = (ALPHA * off ** 2) / nominal;
        } else if (entry.type === "distance") {
          const rel = (distAt(j) - distAt(i) - entry.value) / entry.value;
          prior = ALPHA_DISTANCE * rel * rel * (effort ? active : len);
        } else if (entry.soft?.type === "time") {
          const nominal = entry.soft.value / factor;
          prior = (EDGE_ALPHA * (len - nominal) ** 2) / nominal;
        } else if (entry.soft) {
          const rel = (distAt(j) - distAt(i) - entry.soft.value) / entry.soft.value;
          prior = EDGE_ALPHA * rel * rel * Math.max(len, entry.soft.value / 3 / factor);
        } else {
          prior = entry.freeCost * len;
        }
        if (effort) prior += PAUSE_IN_EFFORT_COST * still;
        const cost = base + sse(i, j) + prior;
        if (cost < cur[j]) {
          cur[j] = cost;
          arg[j] = i;
        }
      }
    }
    from.push(arg);
    prev = cur;
  }
  if (prev[m] === INF) return null;
  const bounds = new Array<number>(K + 1);
  bounds[K] = m;
  for (let k = K - 1; k >= 0; k--) {
    const i = from[k][bounds[k + 1]];
    if (i < 0) return null;
    bounds[k] = i;
  }
  return bounds.map((b) => Math.min(tl.n, b * factor));
}

/** Each fast segment must be truly faster than the recoveries next to it. */
function plausible(tl: Timeline, spans: Span[]): boolean {
  let checked = 0;
  let ok = 0;
  spans.forEach((span, index) => {
    if (span.kind !== "work") return;
    const neighbours = [spans[index - 1], spans[index + 1]].filter((s): s is Span => !!s && s.kind !== "work" && s.end > s.start);
    if (!neighbours.length) return;
    checked++;
    const own = meanSpeed(tl, span.start, span.end);
    const around = Math.max(...neighbours.map((s) => meanSpeed(tl, s.start, s.end)));
    if (own > around * 1.04) ok++;
  });
  return checked === 0 || ok / checked >= 0.66;
}

function nominalSeconds(steps: WorkoutStepInput[]): number {
  // Distances estimated at 3:00/km: only used to discard impossible structures.
  return steps.reduce((sum, step) => {
    if (step.completion_type === "time") return sum + (step.completion_value ?? 0);
    if (step.completion_type === "distance") return sum + (step.completion_value ?? 0) * 0.18;
    return sum;
  }, 0);
}

/** A structure deserves analysis if it has fast segments or several distinct phases. */
export function isStructured(steps: WorkoutStepInput[]): boolean {
  const fixed = steps.filter((step) => step.completion_type !== "manual" && (step.completion_value ?? 0) > 0);
  return fixed.some((step) => step.kind === "work") || fixed.length >= 3;
}

function declaredSpans(tl: Timeline, steps: WorkoutStepInput[]): Span[] | null {
  if (!isStructured(steps) || nominalSeconds(steps) > tl.n * 1.15) return null;
  const template = buildTemplate(steps);
  const bounds = alignTemplate(tl, template);
  if (!bounds) return null;
  const spans: Span[] = [];
  template.forEach((entry, k) => {
    const start = bounds[k];
    const end = bounds[k + 1];
    if (end <= start) return;
    const span: Span = { start, end, kind: entry.kind, label: entry.label, step: entry.step };
    // Free part next to declared warm-up/cool-down: a single segment.
    const previous = spans[spans.length - 1];
    if (previous && previous.kind === span.kind && (span.kind === "warmup" || span.kind === "cooldown")) {
      previous.end = end;
      previous.step = previous.step ?? span.step;
      return;
    }
    spans.push(span);
  });
  // Undeclared recovery that is no slower than the adjacent efforts: there is
  // no stop. It is split in half between the two segments.
  for (let index = spans.length - 2; index >= 1; index--) {
    const span = spans[index];
    if (span.kind !== "recovery" || span.step) continue;
    const before = spans[index - 1];
    const after = spans[index + 1];
    const slowest = Math.min(meanSpeed(tl, before.start, before.end), meanSpeed(tl, after.start, after.end));
    if (meanSpeed(tl, span.start, span.end) < slowest * 0.9) continue;
    const mid = Math.round((span.start + span.end) / 2);
    before.end = mid;
    after.start = mid;
    spans.splice(index, 1);
  }
  // Warm-up or cool-down run at the pace of the adjacent repeat: it was not
  // done (the session starts or ends there), those seconds are repeat.
  for (let index = spans.length - 1; index >= 0; index--) {
    const span = spans[index];
    if (span.kind !== "warmup" && span.kind !== "cooldown") continue;
    const neighbour = span.kind === "warmup" ? spans[index + 1] : spans[index - 1];
    if (!neighbour || neighbour.kind !== "work") continue;
    if (elapsedSpeed(tl, span.start, span.end) < meanSpeed(tl, neighbour.start, neighbour.end) * EDGE_AS_EFFORT) continue;
    if (span.kind === "warmup") neighbour.start = span.start;
    else neighbour.end = span.end;
    spans.splice(index, 1);
  }
  // Warm-up or cool-down of a few seconds: noise at the edges, not a
  // run phase. They end up in the adjacent segment.
  const trimmed = spans.filter((span, index) => {
    const edge = span.kind === "warmup" || span.kind === "cooldown";
    if (!edge || span.end - span.start >= EDGE_MIN_S || spans.length < 2) return true;
    if (index === 0) spans[1].start = span.start;
    else spans[index - 1].end = span.end;
    return false;
  });
  return plausible(tl, trimmed) ? trimmed : null;
}

// ── Descriptions ─────────────────────────────────────────────────────────────

/** Word that distinguishes a segment (hard, sprint, jog…), if the label has one. */
function labelWord(step: WorkoutStepInput): string | null {
  if (step.variant === "sprint") return "sprint";
  if (step.variant === "walk") return "camminata";
  if (step.variant === "jog") return "jogging";
  const word = step.label?.trim().toLowerCase() ?? "";
  if (!word || word.length > 12 || /\d/.test(word) || word.split(/\s+/).length > 2 || GENERIC_LABEL.test(word)) return null;
  return word;
}

/** Compact description, e.g. "5 × 1 km" or "3 × (3' forte + 1' jog + 1' sprint)". */
export function describeStructure(steps: WorkoutStepInput[]): string | null {
  const parts = groupWorkoutSteps(steps)
    .filter((block) => block.kind === "repeat" || (block.step.kind !== "warmup" && block.step.kind !== "cooldown"))
    .map((block) => {
      const items = (block.kind === "repeat" ? block.steps : [block.step])
        // Generic recoveries add nothing: "5 × 1 km", not "5 × (1 km + 2')".
        .filter((step) => step.kind !== "recovery" || labelWord(step))
        .map((step) => [formatStepAmount(step), labelWord(step)].filter(Boolean).join(" ") || STEP_LABELS[step.kind].toLowerCase());
      const body = items.join(" + ");
      return block.kind === "repeat" ? `${block.times} × ${items.length > 1 ? `(${body})` : body}` : body;
    });
  return parts.length ? parts.join(", ") : null;
}

/** Duration rounded to a readable form: 30", 3', 2'15". */
function niceDuration(seconds: number): string {
  const step = seconds < 60 ? 5 : seconds < 300 ? 15 : 30;
  const value = Math.max(step, Math.round(seconds / step) * step);
  if (value < 60) return `${value}"`;
  return value % 60 === 0 ? `${value / 60}'` : `${Math.floor(value / 60)}'${String(value % 60).padStart(2, "0")}"`;
}

function segmentWord(segment: IntervalSegment): string {
  if (segment.variant) return VARIANT_LABELS[segment.variant].toLowerCase();
  return segment.kind === "work" ? "veloce" : segment.kind === "recovery" ? "recupero" : segment.label.toLowerCase();
}

/**
 * Description of the measured segments: finds the repeating block (e.g. fast,
 * jogging, sprint, walking) and writes it with the typical durations:
 * "4 × (3' veloce + 30" jogging + 30" sprint + 2' camminata)".
 */
export function describeSegments(segments: IntervalSegment[]): string {
  const main = segments.filter((s) => s.kind !== "warmup" && s.kind !== "cooldown");
  const tokens = main.map((s) => `${s.kind}:${s.variant ?? ""}`);
  for (let period = 1; period <= Math.min(8, Math.floor(tokens.length / 2)); period++) {
    if (!tokens.slice(0, period).some((t) => t.startsWith("work"))) continue;
    if (!tokens.every((token, i) => token === tokens[i % period])) continue;
    const times = Math.ceil(tokens.length / period);
    const parts = Array.from({ length: period }, (_, k) => {
      const durations = main.filter((_, i) => i % period === k).map((s) => s.duration_s);
      return `${niceDuration(median(durations)!)} ${segmentWord(main[k])}`;
    });
    return `${times} × ${parts.length > 1 ? `(${parts.join(" + ")})` : parts[0]}`;
  }
  const sprints = main.filter((s) => s.variant === "sprint").length;
  const fast = main.filter((s) => s.kind === "work").length - sprints;
  return [fast ? `${fast} ${fast === 1 ? "tratto veloce" : "tratti veloci"}` : null, sprints ? `${sprints} sprint` : null].filter(Boolean).join(" + ");
}

/** Labels and targets of the declared structure on the laps, if they match. */
function labelLaps(spans: Span[], steps: WorkoutStepInput[] | undefined): Span[] {
  if (!steps?.length) return spans;
  let offset: number | null = null;
  if (spans.length === steps.length) offset = 0;
  else if (spans.length === steps.length + 2) offset = 1;
  if (offset == null) return spans;
  return spans.map((span, index) => {
    const step = steps[index - offset!];
    return step ? { ...span, kind: step.kind, label: step.label?.trim() || STEP_LABELS[step.kind], step } : span;
  });
}

// ── Assembly ─────────────────────────────────────────────────────────────────

const EMPTY: IntervalAnalysis = { version: INTERVALS_VERSION, source: "none", description: null, segments: [], summary: null };

export function analyzeIntervals(input: AnalyzeInput): IntervalAnalysis {
  const tl = buildTimeline(input);
  if (!tl) return EMPTY;
  const structures = (input.structures ?? []).filter((s) => s.steps.length > 0);
  const build = (spans: Span[], source: IntervalSource, description: string | null) => {
    const segments = tidyRecoveries(refineVariants(tl, spans)).map((span) => measure(tl, span));
    return finalize(segments, source, description ?? describeSegments(segments));
  };

  // Laps that follow the declared session: the most reliable structure.
  if (input.laps?.length) {
    for (const structure of structures) {
      const matched = matchLapsToSteps(input.laps, structure.steps, tl);
      if (matched) return build(matched, "laps", structure.description ?? describeStructure(structure.steps));
    }
  }

  const laps = input.laps?.length ? lapSpans(input.laps, tl) : null;
  if (laps) {
    const declared = structures[0];
    const labelled = labelLaps(laps, declared?.steps);
    return build(labelled, "laps", declared ? declared.description ?? describeStructure(declared.steps) : null);
  }

  for (const structure of structures) {
    const spans = declaredSpans(tl, structure.steps);
    if (spans) return build(spans, structure.source, structure.description ?? describeStructure(structure.steps));
  }

  const auto = autoSpans(tl);
  if (!auto) return EMPTY;
  const analysis = build(auto, "auto", null);
  if (!isContinuous(input.planned)) return analysis;
  const verdict = againstPlan(analysis, tl.n);
  if (verdict === "noise") return EMPTY;
  return verdict === "reps" ? { ...analysis, contradicts_plan: input.planned } : analysis;
}

// ── The plan as a reference ──────────────────────────────────────────────────

export type ContinuousType = "long" | "easy" | "recovery";

export const isContinuous = (type: WorkoutType | null | undefined): type is ContinuousType =>
  type === "long" || type === "easy" || type === "recovery";

/** With a continuous run in the plan, at least three true repeats are needed… */
const PLAN_MIN_REPS = 3;
/** …of at least 30 seconds each (as for the run type, run-type)… */
const PLAN_REP_MIN_S = 30;
/** …that together make up a real part of the run (as AUTO_WORK_SHARE in body-trends). */
const PLAN_WORK_SHARE = 0.2;
/** Or at least three strides: short sprints, not GPS spikes of a few seconds. */
const PLAN_STRIDE_MIN_S = 12;

/**
 * The plan said long, easy or recovery: automatic detection counts only
 * if it finds clear repeats (three fast segments of at least 30", which together make up
 * a fifth of the run) or true strides. Pace variations in a continuous run
 * (downhills, wind, GPS noise) are not enough. Strides in an easy
 * run don't contradict the plan.
 */
function againstPlan(analysis: IntervalAnalysis, seconds: number): "reps" | "strides" | "noise" {
  const work = analysis.segments.filter((s) => s.kind === "work");
  const reps = work.filter((s) => s.variant !== "sprint" && s.duration_s >= PLAN_REP_MIN_S);
  const repTime = reps.reduce((sum, s) => sum + s.duration_s, 0);
  if (reps.length >= PLAN_MIN_REPS && repTime >= seconds * PLAN_WORK_SHARE) return "reps";
  const strides = work.filter((s) => s.variant === "sprint" && s.duration_s >= PLAN_STRIDE_MIN_S);
  return strides.length >= PLAN_MIN_REPS ? "strides" : "noise";
}

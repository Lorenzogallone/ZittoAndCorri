// Analisi delle ripetute: divide una corsa nei suoi tratti (riscaldamento,
// tratti veloci, recuperi, defaticamento) e misura come è stato corso ognuno.
// La struttura arriva, in ordine di affidabilità, da:
//   1. i lap del file FIT, se non sono i soliti lap automatici a km;
//   2. una struttura dichiarata (nota dell'atleta o seduta del piano), che si
//      allinea sulla curva di velocità con una segmentazione ottima;
//   3. un rilevamento automatico, solo se l'alternanza è netta.
// Funzioni pure.

import type { GpsPoint, HrPoint, WorkoutStepInput, WorkoutStepKind } from "@/lib/types";
import { cumulativeDistance } from "./geo.ts";
import { formatStepAmount, groupWorkoutSteps } from "../workout-guide.ts";

export const INTERVALS_VERSION = 1;

/** Distanza cumulativa registrata dall'orologio (m) a t secondi dall'inizio. */
export interface DistancePoint {
  t: number;
  d: number;
}

/** Lap del file FIT, già relativo all'inizio dell'attività. */
export interface FitLap {
  start_s: number;
  duration_s: number;
  distance_m: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  /** intensity FIT: active, rest, warmup, cooldown, recovery, interval… */
  intensity: string | null;
  /** lap_trigger FIT: manual, distance, time, session_end… */
  trigger: string | null;
  /** Indice dello step del workout guidato, se l'orologio lo seguiva. */
  step: number | null;
}

export type IntervalSource = "laps" | "notes" | "plan" | "auto";

export interface IntervalSegment {
  kind: WorkoutStepKind;
  label: string;
  start_s: number;
  duration_s: number;
  distance_m: number | null;
  pace_s_km: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  /** Battiti recuperati durante un recupero (inizio − fine). */
  hr_drop: number | null;
  /** Durata o distanza prevista dalla struttura. */
  target: { type: "time" | "distance"; value: number } | null;
  target_pace: { min: number | null; max: number | null } | null;
  /** Scarto dal range di passo previsto: negativo = più veloce. */
  pace_deviation_s: number | null;
  /** Numero della ripetizione tra i tratti uguali (es. 2 di 5). */
  rep: number | null;
  reps: number | null;
}

export interface IntervalSummary {
  work_count: number;
  avg_pace_s_km: number | null;
  fastest_pace_s_km: number | null;
  slowest_pace_s_km: number | null;
  /** Ultima contro prima ripetuta uguale, in %: positivo = calo. */
  fade_pct: number | null;
  avg_hr: number | null;
}

export interface IntervalAnalysis {
  version: number;
  source: IntervalSource | "none";
  description: string | null;
  segments: IntervalSegment[];
  summary: IntervalSummary | null;
  /** Struttura letta dalla nota: resta salvata perché la nota viene svuotata. */
  declared?: { steps: WorkoutStepInput[]; description: string | null } | null;
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
  laps?: FitLap[] | null;
  /** Strutture dichiarate, dalla più affidabile (nota) alla meno (piano). */
  structures?: DeclaredStructure[];
}

// ── Serie a 1 secondo ────────────────────────────────────────────────────────

interface Timeline {
  t0: number;
  n: number;
  dist: Float64Array;
  speed: Float64Array;
  hr: Float64Array;
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
    // Pausa (orologio fermo): la distanza resta ferma fino alla ripresa.
    else if (b.t - a.t > 10) out[i] = a.d;
    else out[i] = a.d + ((b.d - a.d) * (t - a.t)) / (b.t - a.t);
  }
  return out;
}

function resampleHr(points: HrPoint[] | null | undefined, t0: number, n: number): Float64Array {
  const out = new Float64Array(n).fill(Number.NaN);
  if (!points?.length) return out;
  const sorted = [...points].filter((p) => p.bpm > 0).sort((a, b) => a.t - b.t);
  let k = 0;
  for (let i = 0; i < n; i++) {
    const t = t0 + i;
    while (k + 1 < sorted.length && sorted[k + 1].t <= t) k++;
    const a = sorted[k];
    const b = sorted[k + 1];
    if (!a) continue;
    if (t < a.t) {
      if (a.t - t <= 5) out[i] = a.bpm;
    } else if (b && b.t - a.t <= 15) {
      out[i] = a.bpm + ((b.bpm - a.bpm) * (t - a.t)) / (b.t - a.t);
    } else if (t - a.t <= 5) {
      out[i] = a.bpm;
    }
  }
  return out;
}

function buildTimeline(input: AnalyzeInput): Timeline | null {
  let points: Array<{ t: number; d: number }>;
  let half: number;
  if (input.distance && input.distance.length >= 10) {
    points = input.distance.filter((p) => Number.isFinite(p.t) && Number.isFinite(p.d)).map((p) => ({ t: p.t, d: p.d }));
    // Distanza dell'orologio: già filtrata, basta una finestra corta.
    half = 2;
  } else if (input.gps && input.gps.length >= 10) {
    const gps = [...input.gps].sort((a, b) => a.t - b.t);
    const cum = cumulativeDistance(gps);
    points = gps.map((p, i) => ({ t: p.t, d: cum[i] }));
    // GPS rumoroso: finestra più ampia.
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
  return { t0, n, dist, speed, hr: resampleHr(input.hr, t0, n) };
}

// ── Metriche di un tratto ────────────────────────────────────────────────────

interface Span {
  start: number;
  end: number;
  kind: WorkoutStepKind;
  label: string;
  step?: WorkoutStepInput;
  /** Valori misurati dall'orologio (lap), più precisi della serie. */
  lap?: FitLap;
}

function mean(values: number[]): number | null {
  return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null;
}

function paceDeviation(pace: number, min: number | null, max: number | null): number {
  if (min != null && pace < min) return pace - min;
  if (max != null && pace > max) return pace - max;
  return 0;
}

function hrStats(tl: Timeline, start: number, end: number) {
  const values: number[] = [];
  for (let i = start; i < end; i++) if (!Number.isNaN(tl.hr[i])) values.push(tl.hr[i]);
  const edge = (from: number, to: number) => {
    const slice: number[] = [];
    for (let i = Math.max(start, from); i < Math.min(end, to); i++) if (!Number.isNaN(tl.hr[i])) slice.push(tl.hr[i]);
    return mean(slice);
  };
  return {
    avg: values.length ? Math.round(mean(values)!) : null,
    max: values.length ? Math.round(Math.max(...values)) : null,
    first: edge(start, start + 5),
    last: edge(end - 5, end),
  };
}

function measure(tl: Timeline, span: Span): IntervalSegment {
  const start = Math.max(0, Math.min(tl.n - 1, span.start));
  const end = Math.max(start + 1, Math.min(tl.n, span.end));
  const duration = span.lap?.duration_s ?? end - start;
  const seriesDistance = tl.dist[Math.min(end, tl.n - 1)] - tl.dist[start];
  const distance = span.lap?.distance_m ?? seriesDistance;
  const pace = distance >= 30 ? Math.round((duration / distance) * 1000) : null;
  const validPace = pace != null && pace >= 120 && pace <= 1_500 ? pace : null;
  const hr = hrStats(tl, start, end);
  const step = span.step;
  const targetPace = step && (step.pace_min_s_km != null || step.pace_max_s_km != null)
    ? { min: step.pace_min_s_km, max: step.pace_max_s_km }
    : null;
  return {
    kind: span.kind,
    label: span.label,
    start_s: tl.t0 + start,
    duration_s: Math.round(duration),
    distance_m: distance > 0 ? Math.round(distance) : null,
    pace_s_km: validPace,
    avg_hr: span.lap?.avg_hr ?? hr.avg,
    max_hr: span.lap?.max_hr ?? hr.max,
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
 * Tratti "uguali" per numerare le ripetizioni: stesso tipo, etichetta e
 * obiettivo. Senza obiettivo (lap, rilevamento automatico) conta anche la
 * durata, a scaglioni del 25%: un 3' e uno sprint da 1' non sono la stessa serie.
 */
function signature(segment: IntervalSegment): string {
  const shape = segment.target
    ? `${segment.target.type}:${segment.target.value}`
    : `~${Math.round(Math.log(Math.max(1, segment.duration_s)) / Math.log(1.25))}`;
  return [segment.kind, segment.label, shape].join("|");
}

/** Numera le ripetizioni dei tratti uguali e calcola il riepilogo. */
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

  const work = segments.filter((segment) => segment.kind === "work");
  const timed = work.filter((segment) => segment.pace_s_km != null && segment.distance_m);
  const totalDistance = timed.reduce((sum, s) => sum + s.distance_m!, 0);
  const totalTime = timed.reduce((sum, s) => sum + s.duration_s, 0);
  const paces = timed.map((s) => s.pace_s_km!);
  // Calo: sul gruppo di ripetute uguali più numeroso (almeno 3).
  const repeated = [...groups.values()]
    .filter((group) => group[0].kind === "work" && group.length >= 3)
    .sort((a, b) => b.length - a.length)[0];
  const first = repeated?.[0]?.pace_s_km;
  const last = repeated?.[repeated.length - 1]?.pace_s_km;
  const hrs = work.map((s) => s.avg_hr).filter((v): v is number => v != null);
  return {
    version: INTERVALS_VERSION,
    source,
    description,
    segments,
    summary: work.length
      ? {
          work_count: work.length,
          avg_pace_s_km: totalDistance > 0 ? Math.round((totalTime / totalDistance) * 1000) : null,
          fastest_pace_s_km: paces.length ? Math.min(...paces) : null,
          slowest_pace_s_km: paces.length ? Math.max(...paces) : null,
          fade_pct: first && last ? Math.round(((last - first) / first) * 1000) / 10 : null,
          avg_hr: hrs.length ? Math.round(mean(hrs)!) : null,
        }
      : null,
  };
}

// ── 1. Lap del file FIT ──────────────────────────────────────────────────────

const LAP_KINDS: Record<string, WorkoutStepKind> = {
  warmup: "warmup",
  cooldown: "cooldown",
  rest: "recovery",
  recovery: "recovery",
  interval: "work",
  active: "work",
};

const AUTO_TRIGGERS = new Set(["distance", "time", "positionStart", "positionLap", "positionWaypoint", "positionMarked"]);

/** Lap automatici a distanza o tempo fisso: non dicono nulla della struttura. */
export function areAutoLaps(laps: FitLap[]): boolean {
  // Workout guidato sull'orologio: i lap si chiudono a tempo o distanza ma
  // seguono gli step (indice e intensità), quindi sono la struttura vera.
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

/** Soglia di Otsu: separa due gruppi di valori (es. tratti lenti e veloci). */
function otsu(values: number[], weights?: number[]): number | null {
  if (values.length < 2) return null;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  if (hi - lo < 1e-6) return null;
  const bins = 64;
  const hist = new Array<number>(bins).fill(0);
  values.forEach((v, i) => {
    const b = Math.min(bins - 1, Math.floor(((v - lo) / (hi - lo)) * bins));
    hist[b] += weights?.[i] ?? 1;
  });
  const total = hist.reduce((a, b) => a + b, 0);
  let sumAll = 0;
  hist.forEach((h, i) => (sumAll += h * i));
  let wB = 0;
  let sumB = 0;
  let best = -1;
  let threshold = 0;
  for (let i = 0; i < bins; i++) {
    wB += hist[i];
    if (wB === 0 || wB === total) continue;
    sumB += hist[i] * i;
    const mB = sumB / wB;
    const mF = (sumAll - sumB) / (total - wB);
    const between = wB * (total - wB) * (mB - mF) ** 2;
    if (between > best) {
      best = between;
      threshold = i;
    }
  }
  return lo + ((threshold + 1) / bins) * (hi - lo);
}

function lapSpans(laps: FitLap[], tl: Timeline): Span[] | null {
  if (laps.length < 3 || areAutoLaps(laps)) return null;
  const speeds = laps.map((lap) => (lap.distance_m && lap.duration_s ? lap.distance_m / lap.duration_s : 0));
  const hasIntensity = laps.some((lap) => lap.intensity && lap.intensity !== "active");
  const threshold = hasIntensity ? null : otsu(speeds, laps.map((lap) => lap.duration_s));
  if (!hasIntensity && threshold == null) return null;
  const spans = laps.map((lap, index): Span => {
    let kind: WorkoutStepKind;
    if (hasIntensity) kind = LAP_KINDS[lap.intensity ?? "active"] ?? "work";
    else kind = speeds[index] > threshold! ? "work" : "recovery";
    const start = Math.round(lap.start_s - tl.t0);
    return { start, end: start + Math.round(lap.duration_s), kind, label: "", lap };
  });
  // Tratti lenti agli estremi: riscaldamento e defaticamento.
  if (!hasIntensity) {
    if (spans[0].kind === "recovery") spans[0].kind = "warmup";
    if (spans[spans.length - 1].kind === "recovery") spans[spans.length - 1].kind = "cooldown";
  }
  if (!spans.some((span) => span.kind === "work")) return null;
  return spans;
}

// ── 2. Struttura dichiarata allineata sulla velocità ─────────────────────────

interface TemplateEntry {
  kind: WorkoutStepKind;
  label: string;
  /** free = durata libera (riscaldamento senza durata, pause non dichiarate). */
  type: "time" | "distance" | "free";
  value: number;
  /** Costo per blocco di una parte libera: le pause non dichiarate costano un po'. */
  freeCost: number;
  step?: WorkoutStepInput;
}

const STEP_LABELS: Record<WorkoutStepKind, string> = {
  warmup: "Riscaldamento",
  work: "Veloce",
  recovery: "Recupero",
  steady: "Continuo",
  cooldown: "Defaticamento",
};

function entryFor(step: WorkoutStepInput): TemplateEntry {
  const fixed = step.completion_type !== "manual" && (step.completion_value ?? 0) > 0;
  return {
    kind: step.kind,
    label: step.label?.trim() || STEP_LABELS[step.kind],
    type: fixed ? step.completion_type as "time" | "distance" : "free",
    value: fixed ? step.completion_value! : 0,
    freeCost: 0,
    step,
  };
}

const isEffort = (step: WorkoutStepInput) => step.kind === "work" || step.kind === "steady";

/**
 * Sequenza da allineare: gli step dichiarati (già espansi), più parti libere
 * all'inizio e alla fine (riscaldamento/defaticamento non scritti) e tra due
 * tratti di sforzo consecutivi, dove l'atleta può aver recuperato senza dirlo.
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

/** Segmentazione ottima: confini dove cambia la velocità, durate vicine a quelle dichiarate. */
function alignTemplate(tl: Timeline, template: TemplateEntry[]): number[] | null {
  const factor = Math.max(1, Math.ceil(tl.n / 1500));
  const m = Math.ceil(tl.n / factor);
  const speed = new Float64Array(m);
  for (let b = 0; b < m; b++) {
    let sum = 0;
    let count = 0;
    for (let i = b * factor; i < Math.min(tl.n, (b + 1) * factor); i++) {
      sum += tl.speed[i];
      count++;
    }
    speed[b] = sum / count;
  }
  const distAt = (block: number) => tl.dist[Math.min(tl.n - 1, block * factor)];
  const s1 = new Float64Array(m + 1);
  const s2 = new Float64Array(m + 1);
  for (let b = 0; b < m; b++) {
    s1[b + 1] = s1[b] + speed[b];
    s2[b + 1] = s2[b] + speed[b] ** 2;
  }
  const avg = s1[m] / m;
  const variance = Math.max(0.04, s2[m] / m - avg ** 2);
  const sse = (i: number, j: number) => {
    const len = j - i;
    if (len <= 0) return 0;
    const sum = s1[j] - s1[i];
    return Math.max(0, s2[j] - s2[i] - (sum * sum) / len) / variance;
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
    // Una pausa non dichiarata o è vera (almeno 15 s) o non c'è.
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
        let prior: number;
        if (entry.type === "time") {
          const nominal = entry.value / factor;
          prior = (ALPHA * (len - nominal) ** 2) / nominal;
        } else if (entry.type === "distance") {
          const rel = (distAt(j) - distAt(i) - entry.value) / entry.value;
          prior = ALPHA * rel * rel * len;
        } else {
          prior = entry.freeCost * len;
        }
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

function meanSpeed(tl: Timeline, start: number, end: number): number {
  if (end <= start) return 0;
  return (tl.dist[Math.min(end, tl.n - 1)] - tl.dist[start]) / (end - start);
}

/** Ogni tratto veloce deve essere davvero più veloce dei recuperi accanto. */
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
  // Distanze stimate a 3:00/km: serve solo a scartare strutture impossibili.
  return steps.reduce((sum, step) => {
    if (step.completion_type === "time") return sum + (step.completion_value ?? 0);
    if (step.completion_type === "distance") return sum + (step.completion_value ?? 0) * 0.18;
    return sum;
  }, 0);
}

/** Una struttura merita l'analisi se ha tratti veloci o più fasi diverse. */
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
    // Parte libera accanto a riscaldamento/defaticamento dichiarati: un tratto solo.
    const previous = spans[spans.length - 1];
    if (previous && previous.kind === span.kind && (span.kind === "warmup" || span.kind === "cooldown" || (!span.step && span.kind === "recovery" && previous.kind === "recovery"))) {
      previous.end = end;
      previous.step = previous.step ?? span.step;
      return;
    }
    spans.push(span);
  });
  return plausible(tl, spans) ? spans : null;
}

// ── 3. Rilevamento automatico ────────────────────────────────────────────────

function rollingMedian(values: Float64Array, half: number): Float64Array {
  const out = new Float64Array(values.length);
  for (let i = 0; i < values.length; i++) {
    const window = Array.from(values.subarray(Math.max(0, i - half), Math.min(values.length, i + half + 1))).sort((a, b) => a - b);
    out[i] = window[Math.floor(window.length / 2)];
  }
  return out;
}

interface Run {
  fast: boolean;
  start: number;
  end: number;
}

function toRuns(flags: boolean[]): Run[] {
  const runs: Run[] = [];
  flags.forEach((fast, i) => {
    const last = runs[runs.length - 1];
    if (last && last.fast === fast) last.end = i + 1;
    else runs.push({ fast, start: i, end: i + 1 });
  });
  return runs;
}

/** Assorbe i tratti più corti di `min` secondi nei vicini. */
function mergeShort(runs: Run[], min: number, onlyFast = false): Run[] {
  let out = runs.map((run) => ({ ...run }));
  for (;;) {
    const candidates = out
      .map((run, index) => ({ run, index }))
      .filter(({ run }) => run.end - run.start < min && (!onlyFast || run.fast) && out.length > 1);
    if (!candidates.length) break;
    candidates.sort((a, b) => (a.run.end - a.run.start) - (b.run.end - b.run.start));
    const { index } = candidates[0];
    out[index].fast = !out[index].fast;
    const merged: Run[] = [];
    for (const run of out) {
      const last = merged[merged.length - 1];
      if (last && last.fast === run.fast) last.end = run.end;
      else merged.push({ ...run });
    }
    out = merged;
  }
  return out;
}

function autoSpans(tl: Timeline): Span[] | null {
  const smooth = rollingMedian(tl.speed, 7);
  const moving = Array.from(smooth).filter((v) => v > 0.8);
  if (moving.length < 300) return null;
  const threshold = otsu(moving);
  if (threshold == null) return null;
  let runs = toRuns(Array.from(smooth, (v) => v > threshold));
  runs = mergeShort(runs, 20);
  runs = mergeShort(runs, 25, true);
  const fast = runs.filter((run) => run.fast);
  const slow = runs.filter((run) => !run.fast);
  if (fast.length < 3 || !slow.length) return null;
  const pool = (list: Run[]) => list.flatMap((run) => Array.from(smooth.subarray(run.start, run.end)));
  const fastValues = pool(fast);
  const slowValues = pool(slow);
  const fastMean = mean(fastValues)!;
  const slowMean = mean(slowValues)!;
  const sd = Math.sqrt(
    (fastValues.reduce((s, v) => s + (v - fastMean) ** 2, 0) + slowValues.reduce((s, v) => s + (v - slowMean) ** 2, 0)) /
      (fastValues.length + slowValues.length),
  );
  const fastShare = fastValues.length / tl.n;
  if ((fastMean - slowMean) / Math.max(sd, 0.05) < 1.2 || fastMean < slowMean * 1.12) return null;
  if (fastShare < 0.08 || fastShare > 0.75) return null;
  return runs.map((run, index): Span => {
    let kind: WorkoutStepKind = run.fast ? "work" : "recovery";
    if (!run.fast && index === 0) kind = "warmup";
    else if (!run.fast && index === runs.length - 1) kind = "cooldown";
    return { start: run.start, end: run.end, kind, label: STEP_LABELS[kind] };
  });
}

// ── Assemblaggio ─────────────────────────────────────────────────────────────

const GENERIC_LABEL = /^(recupero|rec\b|veloce|ripetut|tratto|riscaldamento|defaticamento|corsa|continuo|lavoro|allenamento)/i;

/** Parola che distingue un tratto (forte, sprint, jog…), se l'etichetta ne ha una. */
function labelWord(step: WorkoutStepInput): string | null {
  const word = step.label?.trim().toLowerCase() ?? "";
  if (!word || word.length > 12 || /\d/.test(word) || word.split(/\s+/).length > 2 || GENERIC_LABEL.test(word)) return null;
  return word;
}

/** Descrizione compatta, es. "5 × 1 km" o "3 × (3' forte + 1' jog + 1' sprint)". */
export function describeStructure(steps: WorkoutStepInput[]): string | null {
  const parts = groupWorkoutSteps(steps)
    .filter((block) => block.kind === "repeat" || (block.step.kind !== "warmup" && block.step.kind !== "cooldown"))
    .map((block) => {
      const items = (block.kind === "repeat" ? block.steps : [block.step])
        // I recuperi generici non aggiungono nulla: "5 × 1 km", non "5 × (1 km + 2')".
        .filter((step) => step.kind !== "recovery" || labelWord(step))
        .map((step) => [formatStepAmount(step), labelWord(step)].filter(Boolean).join(" ") || STEP_LABELS[step.kind].toLowerCase());
      const body = items.join(" + ");
      return block.kind === "repeat" ? `${block.times} × ${items.length > 1 ? `(${body})` : body}` : body;
    });
  return parts.length ? parts.join(", ") : null;
}

/** Etichette e obiettivi della struttura dichiarata sui lap, se combaciano. */
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

const EMPTY: IntervalAnalysis = { version: INTERVALS_VERSION, source: "none", description: null, segments: [], summary: null };

export function analyzeIntervals(input: AnalyzeInput): IntervalAnalysis {
  const tl = buildTimeline(input);
  if (!tl) return EMPTY;
  const structures = (input.structures ?? []).filter((s) => s.steps.length > 0);

  const laps = input.laps?.length ? lapSpans(input.laps, tl) : null;
  if (laps) {
    const declared = structures[0];
    const labelled = labelLaps(laps, declared?.steps).map((span) => ({
      ...span,
      label: span.label || STEP_LABELS[span.kind],
    }));
    const work = labelled.filter((span) => span.kind === "work").length;
    const description = declared?.description ?? (declared ? describeStructure(declared.steps) : `${work} ${work === 1 ? "tratto veloce" : "tratti veloci"}`);
    return finalize(labelled.map((span) => measure(tl, span)), "laps", description);
  }

  for (const structure of structures) {
    const spans = declaredSpans(tl, structure.steps);
    if (spans) {
      return finalize(spans.map((span) => measure(tl, span)), structure.source, structure.description ?? describeStructure(structure.steps));
    }
  }

  const auto = autoSpans(tl);
  if (auto) {
    const work = auto.filter((span) => span.kind === "work").length;
    return finalize(auto.map((span) => measure(tl, span)), "auto", `${work} tratti veloci`);
  }
  return EMPTY;
}

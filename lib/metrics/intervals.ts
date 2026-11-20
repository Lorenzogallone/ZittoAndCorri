// Analisi delle ripetute: divide una corsa nei suoi tratti (riscaldamento,
// tratti veloci, sprint, recuperi corricchiando o camminando, defaticamento) e
// misura come è stato corso ognuno. La struttura arriva, in ordine di
// affidabilità, da:
//   1. i lap del file FIT, se non sono i soliti lap automatici a km;
//   2. una struttura dichiarata (nota dell'atleta o seduta del piano), che si
//      allinea sulla curva di velocità con una segmentazione ottima;
//   3. un rilevamento automatico a più livelli (fermo, camminata, jogging,
//      corsa facile, veloce, sprint), solo se l'alternanza è netta.
// Il tipo di ogni tratto (sprint, jogging, camminata) si misura sempre sui
// dati, relativo al passo facile dell'atleta. Funzioni pure.

import type { GpsPoint, HrPoint, WorkoutStepInput, WorkoutStepKind } from "@/lib/types";
import { cumulativeDistance } from "./geo.ts";
import { formatStepAmount, groupWorkoutSteps } from "../workout-guide.ts";
import { detectPauses } from "./pauses.ts";

// 3: tratti misurati sul tempo in movimento (pause dell'orologio escluse).
// 4: lap che combaciano con il piano, riscaldamento e defaticamento facoltativi,
//    soste da fermi come pause, cadenza per tratto.
export const INTERVALS_VERSION = 4;

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

/** Come è stato corso un tratto: sprint, recupero corricchiando, camminando o da fermo. */
export type SegmentVariant = "sprint" | "jog" | "walk" | "stop";

export interface IntervalSegment {
  kind: WorkoutStepKind;
  variant: SegmentVariant | null;
  label: string;
  start_s: number;
  duration_s: number;
  distance_m: number | null;
  pace_s_km: number | null;
  /** Velocità di punta (media su 3 s), utile per gli sprint. */
  max_speed_kmh: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  /** Cadenza media in movimento (passi al minuto). */
  cadence_spm?: number | null;
  /** Secondi in pausa dentro il tratto: non sono nella durata né nel passo. */
  paused_s?: number;
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
  /** Su cosa è calcolato il riepilogo principale: tratti veloci o, se ci sono solo quelli, sprint. */
  main: "work" | "sprint";
  /** Tratti veloci (esclusi gli sprint, che hanno il loro riepilogo). */
  work_count: number;
  avg_pace_s_km: number | null;
  fastest_pace_s_km: number | null;
  slowest_pace_s_km: number | null;
  /** Ultima contro prima ripetuta uguale, in %: positivo = calo. */
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
  /** Cadenza FIT della corsa (rpm = passi al minuto / 2). */
  cadence?: Array<{ t: number; rpm: number }> | null;
  laps?: FitLap[] | null;
  /** Strutture dichiarate, dalla più affidabile (nota) alla meno (piano). */
  structures?: DeclaredStructure[];
}

// ── Soglie ───────────────────────────────────────────────────────────────────

/** Sotto questa velocità media si è fermi (m/s). */
const STOP_SPEED = 0.45;
/** Sotto ≈ 9:00/km si cammina, se manca la cadenza (m/s). */
const WALK_SPEED = 1.85;
/** Sotto questa cadenza si cammina (passi al minuto). */
const WALK_CADENCE = 140;
/** Rispetto al passo facile: oltre è "veloce", sotto è "jogging". */
const FAST_RATIO = 1.15;
const JOG_RATIO = 0.88;
/** Uno sprint è breve. */
const SPRINT_MAX_S = 75;
/** Fermi almeno così a lungo (con l'orologio che registra) è una pausa. */
const STILL_MIN_S = 10;
/** Riscaldamento o defaticamento più corti di così non sono stati corsi. */
const EDGE_MIN_S = 30;
/** Lap finale più corto di così: è la chiusura dell'attività, non un tratto. */
const STUB_LAP_S = 15;
/** Lap e step coincidono se la durata (o la distanza) differisce al massimo così. */
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

// ── Serie a 1 secondo ────────────────────────────────────────────────────────

interface Timeline {
  t0: number;
  n: number;
  dist: Float64Array;
  speed: Float64Array;
  hr: Float64Array;
  /** Passi al minuto; NaN dove manca. */
  cadence: Float64Array;
  /** 1 nei secondi in pausa (orologio fermo o atleta fermo): non contano nel tempo né nel passo. */
  paused: Uint8Array;
  /** Somma cumulata di `paused`: pausedBefore[i] = secondi in pausa prima di i. */
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
    // Pausa (orologio fermo, distanza quasi immobile): resta ferma fino alla
    // ripresa. Un buco con distanza percorsa è solo un campionamento rado.
    else if (b.t - a.t > 10 && (b.d - a.d) / (b.t - a.t) < STOP_SPEED) out[i] = a.d;
    else out[i] = a.d + ((b.d - a.d) * (t - a.t)) / (b.t - a.t);
  }
  return out;
}

/** Interpola una serie sparsa sui secondi; buchi oltre `maxGap` restano NaN. */
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
 * Media mobile delle posizioni (±3 punti): lo zig-zag del GPS gonfia la
 * distanza soprattutto quando si va piano, e una camminata sembrerebbe jogging.
 */
function smoothTrack(gps: GpsPoint[]): GpsPoint[] {
  const half = 3;
  return gps.map((point, i) => {
    let lat = 0;
    let lon = 0;
    let count = 0;
    for (let k = Math.max(0, i - half); k <= Math.min(gps.length - 1, i + half); k++) {
      // Solo punti vicini nel tempo: una pausa non va mediata con la ripresa.
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
    // Distanza dell'orologio: già filtrata, basta una finestra corta.
    half = 2;
  } else if (input.gps && input.gps.length >= 10) {
    const gps = smoothTrack([...input.gps].sort((a, b) => a.t - b.t));
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
  // FC: il sensore perde il segnale a tratti; fino a un minuto si interpola.
  const hr = resampleValues((input.hr ?? []).filter((p) => p.bpm > 0).map((p) => ({ t: p.t, v: p.bpm })), t0, n, 60, 20);
  const cadence = resampleValues((input.cadence ?? []).filter((p) => p.rpm > 0).map((p) => ({ t: p.t, v: p.rpm * 2 })), t0, n, 15, 5);
  // Pause dell'orologio: restano sulla linea del tempo (un recupero da fermo
  // resta un recupero) ma i loro secondi non entrano nel passo dei tratti.
  const paused = new Uint8Array(n);
  for (const pause of detectPauses(points)) {
    const to = Math.min(n, Math.round(pause.to) - t0);
    for (let i = Math.max(0, to - Math.round(pause.removed)); i < to; i++) paused[i] = 1;
  }
  // Soste con l'orologio che registra (semaforo, attesa): contano come pause.
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

/** Secondi in movimento tra start ed end (pause escluse). */
function movingSeconds(tl: Timeline, start: number, end: number): number {
  const a = Math.max(0, Math.min(tl.n, start));
  const b = Math.max(a, Math.min(tl.n, end));
  return b - a - (tl.pausedBefore[b] - tl.pausedBefore[a]);
}

/**
 * Velocità media sul tempo totale, soste comprese: per riconoscere i tratti
 * senza struttura dichiarata (rilevamento automatico, tipo di recupero), dove
 * stare fermi è proprio ciò che distingue un recupero.
 */
function elapsedSpeed(tl: Timeline, start: number, end: number): number {
  if (end <= start) return 0;
  return (tl.dist[Math.min(end, tl.n - 1)] - tl.dist[start]) / (end - start);
}

/** Velocità media in movimento: una pausa dentro il tratto non lo rallenta. */
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
 * Passo facile di riferimento: il 30° percentile della velocità quando si
 * corre (camminate e soste escluse). Tra riscaldamento, jogging e tratti veloci
 * cade sul ritmo della corsa tranquilla.
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

/** Recupero misurato: fermo, camminata o jogging. */
function restVariant(tl: Timeline, start: number, end: number): SegmentVariant {
  const v = elapsedSpeed(tl, start, end);
  if (v < STOP_SPEED) return "stop";
  const cad = meanOf(tl.cadence, start, end);
  if (cad != null ? cad < WALK_CADENCE : v < WALK_SPEED) return "walk";
  return "jog";
}

// ── Tratti ───────────────────────────────────────────────────────────────────

interface Span {
  start: number;
  end: number;
  kind: WorkoutStepKind;
  variant?: SegmentVariant | null;
  label: string;
  step?: WorkoutStepInput;
  /** Valori misurati dall'orologio (lap), più precisi della serie. */
  lap?: FitLap;
}

/**
 * Tipo misurato di ogni tratto: i recuperi diventano jogging, camminata o
 * sosta; i tratti veloci brevi e nettamente più rapidi degli altri (o
 * dichiarati come tali) diventano sprint. Le etichette generiche seguono.
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
      // Riscaldamento o defaticamento camminati: si vede dal colore.
      const variant = restVariant(tl, span.start, span.end);
      out.variant = variant === "jog" ? null : variant;
    }
    if (!out.label) out.label = STEP_LABELS[out.kind];
    // Prima degli allunghi c'era una corsa intera, non un riscaldamento.
    if ((span.kind === "warmup" || span.kind === "cooldown") && span.end - span.start > 1200 && GENERIC_LABEL.test(out.label)) out.label = "Corsa facile";
    return out;
  });
}

/**
 * Recuperi spezzati da frammenti di transizione: si uniscono quelli consecutivi
 * dello stesso tipo e quelli di pochi secondi finiscono nel vicino più lungo.
 * I lap restano come li ha registrati l'orologio.
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
  // Tempo in movimento: le pause non contano né nella durata né nel passo.
  const moving = Math.max(1, elapsed - pausedSeconds);
  // Tratto tutto da fermi (recupero in pausa): dura quanto la sosta.
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
 * Tratti "uguali" per numerare le ripetizioni: stesso tipo, variante,
 * etichetta e obiettivo. Senza obiettivo (lap, rilevamento automatico) conta
 * anche la durata, a scaglioni del 25%.
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

  const sprints = segments.filter((s) => s.kind === "work" && s.variant === "sprint");
  const fast = segments.filter((s) => s.kind === "work" && s.variant !== "sprint");
  // Senza tratti veloci "normali" il riepilogo principale è quello degli sprint.
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

// ── Classificazione a livelli (lap senza intensità e rilevamento automatico) ─

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
 * Da pezzi classificati a tratti: prima del primo sforzo è riscaldamento,
 * dopo l'ultimo defaticamento, in mezzo recuperi (jogging, camminata, sosta).
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
    // Il riscaldamento (o defaticamento) con più ritmi resta un tratto solo.
    if (mergeSame && previous && previous.kind === kind && (kind === "warmup" || kind === "cooldown")) {
      previous.end = piece.end;
      return;
    }
    spans.push({ start: piece.start, end: piece.end, kind, label: "", lap: piece.lap });
  });
  return spans;
}

/** Segmentazione ottima a numero libero di tratti (penalità per ogni cambio). */
function partition(tl: Timeline): Array<[number, number]> {
  const factor = Math.max(3, Math.ceil(tl.n / 1200));
  const m = Math.ceil(tl.n / factor);
  const block = new Float64Array(m);
  for (let b = 0; b < m; b++) block[b] = elapsedSpeed(tl, b * factor, Math.min(tl.n, (b + 1) * factor));
  // Rumore stimato dalle differenze tra blocchi vicini (robusto ai cambi di ritmo).
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

/** Affina i confini al secondo, dentro ± un blocco. */
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
 * Rilevamento automatico: tratti veloci veri solo se tra uno sforzo e l'altro
 * c'è un recupero netto (jogging lento, camminata, sosta) oppure se sono molto
 * più veloci del passo facile (sprint, allunghi). Così le salite e discese di
 * una corsa facile non diventano ripetute.
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

/**
 * Il lap finale di pochi secondi (chiusura dell'attività dopo l'ultimo tratto)
 * si unisce al precedente: non è un tratto a sé.
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
 * Soglia dei tratti veloci ricavata dai lap stessi: divide i lap corsi in due
 * gruppi di velocità (pesati per durata) e la tiene solo se i due gruppi sono
 * nettamente diversi. Serve quando quasi tutta la corsa è a ritmo sostenuto e
 * il passo facile stimato sulla serie cade troppo in alto.
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
  // Lap premuti a mano: ogni lap si classifica sul ritmo, a più livelli.
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

/** Il lap ha la durata (o la distanza) dello step? Riscaldamento, defaticamento e step liberi vanno sempre bene. */
function lapFitsStep(lap: FitLap, step: WorkoutStepInput): boolean {
  if (step.kind === "warmup" || step.kind === "cooldown") return true;
  const value = step.completion_value ?? 0;
  if (step.completion_type === "manual" || value <= 0) return true;
  if (step.completion_type === "time") return Math.abs(lap.duration_s - value) <= Math.max(4, value * LAP_MATCH_RATIO);
  if (lap.distance_m == null) return false;
  return Math.abs(lap.distance_m - value) <= Math.max(25, value * LAP_MATCH_RATIO);
}

/**
 * Lap che seguono la seduta dichiarata: l'orologio ha chiuso un lap a ogni
 * step (workout guidato o lap premuti al cambio). Si accettano un
 * riscaldamento o un defaticamento non scritti o saltati e una seduta finita
 * prima, purché i tratti a durata o distanza fissa combacino quasi tutti.
 */
function matchLapsToSteps(rawLaps: FitLap[], steps: WorkoutStepInput[], tl: Timeline): Span[] | null {
  const laps = withoutStubLap(rawLaps);
  if (laps.length < 3 || !steps.length) return null;
  const located = locateLaps(laps, tl);
  const fixed = (step: WorkoutStepInput) =>
    step.kind !== "warmup" && step.kind !== "cooldown" && step.completion_type !== "manual" && (step.completion_value ?? 0) > 0;
  // Inizio: dal primo step, oppure saltando il riscaldamento dichiarato.
  const firstOptions = steps[0].kind === "warmup" ? [0, 1] : [0];
  for (const first of firstOptions) {
    // Un lap in più all'inizio fa da riscaldamento se il piano non lo scrive.
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
        // Un lap in più alla fine: defaticamento non scritto.
        if (index === located.length - 1 && (!step || step.kind === "cooldown")) {
          spans.push({ start, end, kind: "cooldown", label: step?.label?.trim() || STEP_LABELS.cooldown, step, lap });
          s++;
          return;
        }
        ok = false;
      });
      if (!ok) continue;
      // Step rimasti senza lap: solo se la seduta è stata interrotta dopo
      // gran parte del lavoro (es. defaticamento non fatto).
      const remainingFixed = steps.slice(s).filter(fixed).length;
      const totalFixed = steps.filter(fixed).length;
      if (matchedFixed < 2 || remainingFixed > Math.floor(totalFixed / 3)) continue;
      if (!spans.some((span) => span.kind === "work" || span.kind === "steady")) continue;
      return spans;
    }
  }
  return null;
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
  /** Riscaldamento/defaticamento dichiarato: durata o distanza indicativa, può andare a zero. */
  soft?: { type: "time" | "distance"; value: number };
  step?: WorkoutStepInput;
}

function entryFor(step: WorkoutStepInput): TemplateEntry {
  // Riscaldamento e defaticamento si accorciano o si saltano spesso: la loro
  // durata pesa poco e può andare a zero (altrimenti si mangiano l'ultima
  // ripetuta), ma a ritmo uguale al resto tiene il confine vicino al previsto.
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
/** La distanza misurata è un dato certo (GPS o orologio): un km dichiarato deve durare circa un km. */
const ALPHA_DISTANCE = 30;
/** Peso della durata indicativa di riscaldamento e defaticamento (le ripetute pesano ALPHA). */
const EDGE_ALPHA = 0.3;
/** Riscaldamento o defaticamento veloce almeno così rispetto alla ripetuta accanto: è la ripetuta. */
const EDGE_AS_EFFORT = 0.93;
/** Costo per blocco di pausa dentro uno sforzo: a parità, la sosta sta nel recupero. */
const PAUSE_IN_EFFORT_COST = 0.3;

/** Segmentazione ottima: confini dove cambia la velocità, durate vicine a quelle dichiarate. */
function alignTemplate(tl: Timeline, template: TemplateEntry[]): number[] | null {
  const factor = Math.max(1, Math.ceil(tl.n / 1500));
  const m = Math.ceil(tl.n / factor);
  // Ogni blocco pesa per i secondi in movimento: le pause non hanno velocità,
  // così una sosta a metà ripetuta non sembra un cambio di ritmo.
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
        // Sforzi misurati sul tempo in movimento; le pause al confine con un
        // recupero vanno al recupero (lì sono riposo).
        const still = len - (s0[j] - s0[i]);
        const effort = entry.kind === "work" || entry.kind === "steady";
        const active = len - still;
        let prior: number;
        if (entry.type === "time") {
          const nominal = entry.value / factor;
          // Un recupero può contare la sosta come riposo oppure no: vale il più vicino.
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
    if (previous && previous.kind === span.kind && (span.kind === "warmup" || span.kind === "cooldown")) {
      previous.end = end;
      previous.step = previous.step ?? span.step;
      return;
    }
    spans.push(span);
  });
  // Recupero non dichiarato che non è più lento degli sforzi accanto: non c'è
  // stato. Si divide a metà tra i due tratti.
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
  // Riscaldamento o defaticamento corso al ritmo della ripetuta accanto: non
  // è stato fatto (la seduta inizia o finisce lì), quei secondi sono ripetuta.
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
  // Riscaldamento o defaticamento di pochi secondi: rumore ai bordi, non una
  // fase corsa. Finiscono nel tratto accanto.
  const trimmed = spans.filter((span, index) => {
    const edge = span.kind === "warmup" || span.kind === "cooldown";
    if (!edge || span.end - span.start >= EDGE_MIN_S || spans.length < 2) return true;
    if (index === 0) spans[1].start = span.start;
    else spans[index - 1].end = span.end;
    return false;
  });
  return plausible(tl, trimmed) ? trimmed : null;
}

// ── Descrizioni ──────────────────────────────────────────────────────────────

/** Parola che distingue un tratto (forte, sprint, jog…), se l'etichetta ne ha una. */
function labelWord(step: WorkoutStepInput): string | null {
  if (step.variant === "sprint") return "sprint";
  if (step.variant === "walk") return "camminata";
  if (step.variant === "jog") return "jogging";
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

/** Durata arrotondata in forma leggibile: 30", 3', 2'15". */
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
 * Descrizione dei tratti misurati: cerca il blocco che si ripete (es. veloce,
 * jogging, sprint, camminata) e lo scrive con le durate tipiche:
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

// ── Assemblaggio ─────────────────────────────────────────────────────────────

const EMPTY: IntervalAnalysis = { version: INTERVALS_VERSION, source: "none", description: null, segments: [], summary: null };

export function analyzeIntervals(input: AnalyzeInput): IntervalAnalysis {
  const tl = buildTimeline(input);
  if (!tl) return EMPTY;
  const structures = (input.structures ?? []).filter((s) => s.steps.length > 0);
  const build = (spans: Span[], source: IntervalSource, description: string | null) => {
    const segments = tidyRecoveries(refineVariants(tl, spans)).map((span) => measure(tl, span));
    return finalize(segments, source, description ?? describeSegments(segments));
  };

  // Lap che seguono la seduta dichiarata: la struttura più affidabile.
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
  return auto ? build(auto, "auto", null) : EMPTY;
}

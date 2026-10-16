// Verifica del passo nelle sedute con target (ripetute, tempo, progressivi).
// Per ogni tratto previsto cerca nella traccia GPS la finestra più veloce della
// stessa lunghezza (in metri o in secondi), senza sovrapposizioni: così il
// confronto funziona anche se l'atleta non ha avviato la seduta guidata.
// Funzioni pure.

import type { GpsPoint, WorkoutStepInput } from "@/lib/types";
import { cumulativeDistance } from "./geo.ts";

export type PaceStatus = "on_target" | "fast" | "slow";

export interface PaceCheckRep {
  target_min: number | null;
  target_max: number | null;
  pace_s_km: number;
  /** Negativo = più veloce del range, positivo = più lento, 0 = dentro. */
  deviation_s: number;
}

export interface PaceCheck {
  status: PaceStatus;
  avg_deviation_s: number;
  reps: PaceCheckRep[];
}

/** Scarto medio entro cui la seduta è considerata in linea (s/km). */
export const PACE_TOLERANCE_S = 5;

interface Window {
  start: number;
  end: number;
  pace: number;
}

function hasPace(step: WorkoutStepInput): boolean {
  return step.pace_min_s_km != null || step.pace_max_s_km != null;
}

/** Tratti da verificare: i "veloci" con passo, altrimenti le parti continue con passo. */
export function stepsToCheck(steps: WorkoutStepInput[]): WorkoutStepInput[] {
  const measurable = steps.filter(
    (step) => hasPace(step) && step.completion_type !== "manual" && (step.completion_value ?? 0) > 0,
  );
  const work = measurable.filter((step) => step.kind === "work");
  if (work.length) return work;
  return measurable.filter((step) => step.kind === "steady");
}

/** Intervalli di indici liberi [from, to] dato l'elenco delle finestre già usate. */
function freeRanges(n: number, used: Window[]): Array<[number, number]> {
  const sorted = [...used].sort((a, b) => a.start - b.start);
  const ranges: Array<[number, number]> = [];
  let cursor = 0;
  for (const window of sorted) {
    if (window.start - 1 >= cursor) ranges.push([cursor, window.start - 1]);
    cursor = Math.max(cursor, window.end + 1);
  }
  if (cursor <= n - 1) ranges.push([cursor, n - 1]);
  return ranges;
}

function fastestByDistance(times: number[], cum: number[], from: number, to: number, meters: number): Window | null {
  let best: Window | null = null;
  let i = from;
  for (let j = from + 1; j <= to; j++) {
    while (i + 1 < j && cum[j] - cum[i + 1] >= meters) i++;
    const covered = cum[j] - cum[i];
    const elapsed = times[j] - times[i];
    if (covered < meters || elapsed <= 0) continue;
    const pace = (elapsed / covered) * 1000;
    if (!best || pace < best.pace) best = { start: i, end: j, pace };
  }
  return best;
}

function fastestByTime(times: number[], cum: number[], from: number, to: number, seconds: number): Window | null {
  let best: Window | null = null;
  let i = from;
  for (let j = from + 1; j <= to; j++) {
    while (i + 1 < j && times[j] - times[i + 1] >= seconds) i++;
    const elapsed = times[j] - times[i];
    const covered = cum[j] - cum[i];
    if (elapsed < seconds || covered <= 0) continue;
    const pace = (elapsed / covered) * 1000;
    if (!best || pace < best.pace) best = { start: i, end: j, pace };
  }
  return best;
}

function deviation(pace: number, min: number | null, max: number | null): number {
  if (min != null && pace < min) return pace - min;
  if (max != null && pace > max) return pace - max;
  return 0;
}

/**
 * Confronta i tratti con passo target della seduta con la traccia GPS.
 * Null se la traccia non basta o la seduta non ha tratti con passo.
 */
export function checkPace(gps: GpsPoint[] | null | undefined, steps: WorkoutStepInput[]): PaceCheck | null {
  if (!gps || gps.length < 10) return null;
  const targets = stepsToCheck(steps);
  if (!targets.length) return null;

  const cum = cumulativeDistance(gps);
  const times = gps.map((point) => point.t);
  const used: Window[] = [];
  const found = new Array<Window | null>(targets.length).fill(null);

  // I tratti più lunghi si piazzano per primi: i corti trovano posto negli spazi rimasti.
  const order = targets
    .map((step, index) => ({ step, index }))
    .sort((a, b) => (b.step.completion_value ?? 0) - (a.step.completion_value ?? 0));
  for (const { step, index } of order) {
    let best: Window | null = null;
    for (const [from, to] of freeRanges(gps.length, used)) {
      const candidate = step.completion_type === "distance"
        ? fastestByDistance(times, cum, from, to, step.completion_value!)
        : fastestByTime(times, cum, from, to, step.completion_value!);
      if (candidate && (!best || candidate.pace < best.pace)) best = candidate;
    }
    if (!best) return null;
    used.push(best);
    found[index] = best;
  }

  const reps = targets.map((step, index) => {
    const pace = Math.round(found[index]!.pace);
    return {
      target_min: step.pace_min_s_km,
      target_max: step.pace_max_s_km,
      pace_s_km: pace,
      deviation_s: deviation(pace, step.pace_min_s_km, step.pace_max_s_km),
    };
  });
  const avg = Math.round(reps.reduce((sum, rep) => sum + rep.deviation_s, 0) / reps.length);
  const status: PaceStatus = Math.abs(avg) <= PACE_TOLERANCE_S ? "on_target" : avg < 0 ? "fast" : "slow";
  return { status, avg_deviation_s: avg, reps };
}

// Migliori prestazioni (best effort) su distanze standard e record personali.
// Funzioni pure: il tempo migliore su ogni distanza è la finestra più veloce
// della traccia GPS che copre almeno quella distanza.

import type { GpsPoint } from "@/lib/types";
import { cumulativeDistance } from "./geo.ts";

export type EffortKey = "1k" | "5k" | "10k" | "half" | "marathon";

export const EFFORTS: ReadonlyArray<{ key: EffortKey; meters: number; label: string }> = [
  { key: "1k", meters: 1_000, label: "1 km" },
  { key: "5k", meters: 5_000, label: "5 km" },
  { key: "10k", meters: 10_000, label: "10 km" },
  { key: "half", meters: 21_097, label: "Mezza" },
  { key: "marathon", meters: 42_195, label: "Maratona" },
];

/** Secondi per distanza standard. Oggetto vuoto = calcolato, nessun dato utile. */
export type BestEfforts = Partial<Record<EffortKey, number>>;

/** Velocità oltre la quale una finestra è sicuramente un errore GPS (m/s). */
const MAX_EFFORT_SPEED = 7;

/** Tempo minimo (s) per coprire `meters` lungo la traccia, interpolando l'inizio. */
function fastestWindow(times: number[], cum: number[], meters: number): number | null {
  const n = cum.length;
  if (n < 2 || cum[n - 1] < meters) return null;
  let best: number | null = null;
  let i = 0;
  for (let j = 1; j < n; j++) {
    while (i + 1 < j && cum[j] - cum[i + 1] >= meters) i++;
    const covered = cum[j] - cum[i];
    if (covered < meters) continue;
    // Punto esatto in cui inizia la finestra di `meters` metri.
    const startDistance = cum[j] - meters;
    const segment = cum[i + 1] - cum[i];
    const fraction = segment > 0 ? (startDistance - cum[i]) / segment : 0;
    const startTime = times[i] + (times[i + 1] - times[i]) * Math.min(1, Math.max(0, fraction));
    const elapsed = times[j] - startTime;
    if (elapsed <= 0 || meters / elapsed > MAX_EFFORT_SPEED) continue;
    if (best == null || elapsed < best) best = elapsed;
  }
  return best == null ? null : Math.round(best);
}

/** Best effort dalla traccia GPS di una corsa. */
export function bestEffortsFromGps(gps: GpsPoint[]): BestEfforts {
  if (!gps || gps.length < 2) return {};
  const cum = cumulativeDistance(gps);
  const times = gps.map((p) => p.t);
  const out: BestEfforts = {};
  for (const effort of EFFORTS) {
    const seconds = fastestWindow(times, cum, effort.meters);
    if (seconds != null) out[effort.key] = seconds;
  }
  return out;
}

/**
 * Best effort di un'attività. Usa il GPS quando c'è; senza GPS conta solo una
 * corsa la cui distanza totale corrisponde a una distanza standard (es. una
 * gara inserita a mano), riportando il tempo alla distanza esatta.
 * Null per le attività non di corsa.
 */
export function bestEffortsForActivity(activity: {
  sport: string;
  distance_m: number;
  duration_s: number;
  moving_time_s?: number | null;
  gps?: GpsPoint[] | null;
}): BestEfforts | null {
  if (activity.sport !== "running") return null;
  const fromGps = activity.gps && activity.gps.length >= 2 ? bestEffortsFromGps(activity.gps) : {};
  const active = activity.moving_time_s ?? activity.duration_s;
  for (const effort of EFFORTS) {
    if (fromGps[effort.key] != null || active <= 0) continue;
    const ratio = activity.distance_m / effort.meters;
    if (ratio >= 0.995 && ratio <= 1.04) {
      const scaled = Math.round(active / ratio);
      if (effort.meters / scaled <= MAX_EFFORT_SPEED) fromGps[effort.key] = scaled;
    }
  }
  return fromGps;
}

export interface PersonalRecord {
  key: EffortKey;
  label: string;
  meters: number;
  time_s: number;
  activity_id: string;
  date: string;
}

/** Record personali: per ogni distanza il miglior tempo e l'attività che lo detiene. */
export function personalRecords(
  activities: Array<{ id: string; started_at: string; best_efforts: BestEfforts | null }>,
): PersonalRecord[] {
  const records: PersonalRecord[] = [];
  for (const effort of EFFORTS) {
    let best: PersonalRecord | null = null;
    for (const activity of activities) {
      const time = activity.best_efforts?.[effort.key];
      if (time == null || time <= 0) continue;
      if (!best || time < best.time_s || (time === best.time_s && activity.started_at < best.date)) {
        best = {
          key: effort.key,
          label: effort.label,
          meters: effort.meters,
          time_s: time,
          activity_id: activity.id,
          date: activity.started_at,
        };
      }
    }
    if (best) records.push(best);
  }
  return records;
}

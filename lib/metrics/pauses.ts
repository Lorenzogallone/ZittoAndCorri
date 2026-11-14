// Pause dell'orologio: quando l'atleta mette in pausa (o scatta l'auto-pausa)
// l'orologio smette di registrare punti, e negli stream resta un buco di tempo
// in cui la distanza non avanza. Split, ripetute, best effort e deriva vanno
// misurati sul tempo in movimento, come fa l'orologio: qui si trovano le pause
// e si riportano gli stream su un "orologio in movimento" senza quei secondi.
// Funzioni pure.

import { cumulativeDistance, type TrackPoint } from "./geo.ts";

export interface Pause {
  /** Ultimo punto registrato prima della pausa (s dall'inizio). */
  from: number;
  /** Primo punto registrato dopo la pausa. */
  to: number;
  /** Secondi tolti: il buco meno un normale intervallo di registrazione. */
  removed: number;
}

/** Sotto questa velocità (m/s) un buco di registrazione è una pausa: fermi, o al massimo qualche passo. */
const PAUSE_SPEED = 0.8;
/** Buchi lunghi: anche camminando piano mentre l'orologio è fermo. */
const LONG_GAP_S = 15;
const LONG_GAP_SPEED = 1.6;
/** Un buco più corto non si distingue dalla registrazione "smart" dell'orologio. */
const MIN_GAP_S = 3;

function median(values: number[]): number {
  if (!values.length) return 1;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * Pause da una traccia tempo/distanza cumulata. Un buco tra due punti è una
 * pausa se dura più di qualche intervallo di registrazione e in quel tempo la
 * distanza è avanzata a passo da fermo (o da camminata, se il buco è lungo).
 */
export function detectPauses(track: Array<{ t: number; d: number }>): Pause[] {
  const points = track
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.d))
    .sort((a, b) => a.t - b.t);
  if (points.length < 3) return [];
  const steps: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const dt = points[i].t - points[i - 1].t;
    if (dt > 0) steps.push(dt);
  }
  const step = Math.max(1, median(steps));
  const pauses: Pause[] = [];
  for (let i = 1; i < points.length; i++) {
    const dt = points[i].t - points[i - 1].t;
    if (dt < Math.max(MIN_GAP_S, step * 2.5)) continue;
    const speed = Math.max(0, points[i].d - points[i - 1].d) / dt;
    if (speed < PAUSE_SPEED || (dt >= LONG_GAP_S && speed < LONG_GAP_SPEED)) {
      pauses.push({ from: points[i - 1].t, to: points[i].t, removed: dt - step });
    }
  }
  return pauses;
}

/** Traccia di riferimento: la distanza dell'orologio se c'è, altrimenti il GPS. */
export function referenceTrack(streams: {
  distance?: Array<{ t: number; d: number }> | null;
  gps?: TrackPoint[] | null;
}): Array<{ t: number; d: number }> | null {
  if (streams.distance && streams.distance.length >= 10) return streams.distance;
  if (streams.gps && streams.gps.length >= 10) {
    const gps = [...streams.gps].sort((a, b) => a.t - b.t);
    const cum = cumulativeDistance(gps);
    return gps.map((p, i) => ({ t: p.t, d: cum[i] }));
  }
  return null;
}

/** Converte un istante dell'orologio reale nel tempo in movimento (pause tolte). */
export function movingClock(pauses: Pause[]): (t: number) => number {
  if (!pauses.length) return (t) => t;
  return (t) => {
    let shift = 0;
    for (const pause of pauses) {
      if (t >= pause.to) {
        shift += pause.removed;
        continue;
      }
      // Dentro la pausa: resta fermo all'inizio, più l'intervallo normale.
      if (t > pause.from) return pause.from - shift + Math.min(t - pause.from, pause.to - pause.from - pause.removed);
      break;
    }
    return t - shift;
  };
}

interface Lap {
  start_s: number;
  duration_s: number;
}

export interface PauseStreams {
  gps?: TrackPoint[] | null;
  hr?: Array<{ t: number; bpm: number }> | null;
  distance?: Array<{ t: number; d: number }> | null;
  cadence?: Array<{ t: number; rpm: number }> | null;
  laps?: Lap[] | null;
}

/** Totale dei secondi in pausa. */
export const pausedSeconds = (pauses: Pause[]) => pauses.reduce((sum, pause) => sum + pause.removed, 0);

/**
 * Gli stessi stream sul tempo in movimento: ogni pausa sparisce e quello che
 * viene dopo scala indietro. I lap si accorciano dei secondi di pausa che
 * contengono. Stream senza pause tornano identici.
 */
export function withoutPauses<S extends PauseStreams>(streams: S): S {
  const track = referenceTrack(streams);
  const pauses = track ? detectPauses(track) : [];
  if (!pauses.length) return streams;
  const clock = movingClock(pauses);
  const remap = <P extends { t: number }>(series: P[] | null | undefined) =>
    series ? series.map((point) => ({ ...point, t: clock(point.t) })) : series;
  return {
    ...streams,
    gps: remap(streams.gps),
    hr: remap(streams.hr),
    distance: remap(streams.distance),
    cadence: remap(streams.cadence),
    laps: streams.laps?.map((lap) => {
      const start = clock(lap.start_s);
      return { ...lap, start_s: start, duration_s: Math.max(1, clock(lap.start_s + lap.duration_s) - start) };
    }) ?? streams.laps,
  } as S;
}

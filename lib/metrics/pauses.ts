// Watch pauses: when the athlete pauses (or auto-pause kicks in)
// the watch stops recording points, and the streams are left with a time gap
// in which distance doesn't advance. Splits, repeats, best efforts and drift
// must be measured on moving time, as the watch does: here pauses are found
// and the streams are brought onto a "moving clock" without those seconds.
// Pure functions.

import { cumulativeDistance, type TrackPoint } from "./geo.ts";

export interface Pause {
  /** Last point recorded before the pause (s from the start). */
  from: number;
  /** First point recorded after the pause. */
  to: number;
  /** Seconds removed: the gap minus a normal recording interval. */
  removed: number;
}

/** Below this speed (m/s) a recording gap is a pause: stopped, or at most a few steps. */
const PAUSE_SPEED = 0.8;
/** Long gaps: even walking slowly while the watch is stopped. */
const LONG_GAP_S = 15;
const LONG_GAP_SPEED = 1.6;
/** A shorter gap is indistinguishable from the watch's "smart" recording. */
const MIN_GAP_S = 3;

function median(values: number[]): number {
  if (!values.length) return 1;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * Pauses from a cumulative time/distance track. A gap between two points is a
 * pause if it lasts more than a few recording intervals and in that time the
 * distance advanced at a standing pace (or walking, if the gap is long).
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

/** Reference track: the watch distance if available, otherwise GPS. */
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

/** Converts an instant on the real watch clock into moving time (pauses removed). */
export function movingClock(pauses: Pause[]): (t: number) => number {
  if (!pauses.length) return (t) => t;
  return (t) => {
    let shift = 0;
    for (const pause of pauses) {
      if (t >= pause.to) {
        shift += pause.removed;
        continue;
      }
      // Inside the pause: stays still at the start, plus the normal interval.
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

/** Total seconds paused. */
export const pausedSeconds = (pauses: Pause[]) => pauses.reduce((sum, pause) => sum + pause.removed, 0);

/**
 * The same streams on moving time: each pause disappears and what
 * follows shifts back. Laps shorten by the paused seconds they
 * contain. Streams without pauses come back identical.
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

/**
 * Moving time derived from the pauses in the streams, for files that don't
 * state it (or give it equal to the total time). Null if there are no pauses.
 */
export function movingTimeFromStreams(
  duration_s: number,
  streams: { distance?: Array<{ t: number; d: number }> | null; gps?: TrackPoint[] | null },
): number | null {
  const track = referenceTrack(streams);
  if (!track || duration_s <= 0) return null;
  const moving = Math.round(duration_s - pausedSeconds(detectPauses(track)));
  return moving > 0 && moving < duration_s ? moving : null;
}

/** The most reliable moving time among the known ones: the shortest below the total. */
export function bestMovingTime(duration_s: number, ...candidates: Array<number | null | undefined>): number | null {
  const valid = candidates.filter((value): value is number => typeof value === "number" && value > 0 && value < duration_s);
  return valid.length ? Math.min(...valid) : null;
}

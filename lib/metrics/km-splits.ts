// Run km by km, for continuous runs (long, easy): moving time,
// pace, heart rate, cadence and elevation of each kilometre, plus the
// comparison between the two halves. Pure function.

import { detectPauses, movingClock, referenceTrack } from "./pauses.ts";

export interface KmSplit {
  /** Km number (1, 2, …); the last one may be partial. */
  km: number;
  distance_m: number;
  /** Instants on the real watch clock, like the GPS points. */
  start: number;
  end: number;
  /** The same instants on moving time (like the Andamento chart). */
  movingStart: number;
  movingEnd: number;
  /** Moving time of the km: watch pauses don't count. */
  time_s: number;
  pace_s_km: number;
  avg_hr: number | null;
  /** Steps per minute. */
  cadence_spm: number | null;
  /** Elevation difference between end and start of the km, in metres. */
  elevation_m: number | null;
}

export interface KmHalves {
  /** Second half minus first: negative = faster. */
  pace_delta_s_km: number;
  /** Second half minus first, bpm. */
  hr_delta: number | null;
}

export interface KmAnalysis {
  splits: KmSplit[];
  halves: KmHalves | null;
}

interface KmStreams {
  distance?: Array<{ t: number; d: number }> | null;
  gps?: Array<{ t: number; lat: number; lon: number; ele?: number }> | null;
  hr?: Array<{ t: number; bpm: number }> | null;
  /** FIT cadence (rpm = steps per minute / 2). */
  cadence?: Array<{ t: number; rpm: number }> | null;
}

/** A final piece shorter than this is not a km: it is the end of the activity. */
const LAST_MIN_M = 200;
/** Below this cadence you are walking or stopped: it doesn't count in the average. */
const RUN_CADENCE_SPM = 120;
/** Elevation as the average of the points in this window (seconds): removes noise. */
const ELE_WINDOW_S = 10;

/** Instant when the cumulative distance reaches `target` (interpolated). */
function timeAt(track: Array<{ t: number; d: number }>, target: number, from: number): { t: number; i: number } {
  for (let i = Math.max(1, from); i < track.length; i++) {
    if (track[i].d >= target) {
      const a = track[i - 1];
      const b = track[i];
      const frac = b.d > a.d ? (target - a.d) / (b.d - a.d) : 0;
      return { t: a.t + frac * (b.t - a.t), i };
    }
  }
  return { t: track[track.length - 1].t, i: track.length - 1 };
}

function meanIn<P extends { t: number }>(points: P[] | null | undefined, start: number, end: number, value: (p: P) => number | null): number | null {
  if (!points?.length) return null;
  let sum = 0;
  let count = 0;
  for (const point of points) {
    if (point.t < start || point.t >= end) continue;
    const v = value(point);
    if (v == null || !Number.isFinite(v)) continue;
    sum += v;
    count++;
  }
  return count ? sum / count : null;
}

/** Elevation around instant t, average of nearby points. */
function elevationAt(gps: KmStreams["gps"], t: number): number | null {
  return meanIn(gps, t - ELE_WINDOW_S / 2, t + ELE_WINDOW_S / 2, (p) => (typeof p.ele === "number" ? p.ele : null));
}

/** Distance-weighted average of a group of km. */
function weighted(splits: KmSplit[], value: (split: KmSplit) => number | null): number | null {
  let sum = 0;
  let weight = 0;
  for (const split of splits) {
    const v = value(split);
    if (v == null) continue;
    sum += v * split.distance_m;
    weight += split.distance_m;
  }
  return weight ? sum / weight : null;
}

/** First vs second half, on whole km (the partial last one doesn't count). */
function halves(splits: KmSplit[]): KmHalves | null {
  const full = splits.filter((split) => split.distance_m >= 990);
  if (full.length < 4) return null;
  const mid = Math.floor(full.length / 2);
  const first = full.slice(0, mid);
  const second = full.slice(full.length - mid);
  const pace = (group: KmSplit[]) => group.reduce((sum, s) => sum + s.time_s, 0) / (group.reduce((sum, s) => sum + s.distance_m, 0) / 1000);
  const hrFirst = weighted(first, (s) => s.avg_hr);
  const hrSecond = weighted(second, (s) => s.avg_hr);
  return {
    pace_delta_s_km: Math.round(pace(second) - pace(first)),
    hr_delta: hrFirst != null && hrSecond != null ? Math.round(hrSecond - hrFirst) : null,
  };
}

export function kmSplits(streams: KmStreams): KmAnalysis | null {
  const raw = referenceTrack(streams);
  if (!raw || raw.length < 10) return null;
  const track = [...raw].sort((a, b) => a.t - b.t);
  const clock = movingClock(detectPauses(track));
  const d0 = track[0].d;
  const total = track[track.length - 1].d - d0;
  if (total < 1000) return null;

  const splits: KmSplit[] = [];
  let start = track[0].t;
  let index = 1;
  for (let km = 1; (km - 1) * 1000 < total; km++) {
    const distance = Math.min(1000, total - (km - 1) * 1000);
    if (distance < LAST_MIN_M) break;
    const at = distance === 1000 ? timeAt(track, d0 + km * 1000, index) : { t: track[track.length - 1].t, i: track.length - 1 };
    index = at.i;
    const end = at.t;
    const time = clock(end) - clock(start);
    if (time <= 0) break;
    const cadence = meanIn(streams.cadence, start, end, (p) => (p.rpm * 2 >= RUN_CADENCE_SPM ? p.rpm * 2 : null));
    const hr = meanIn(streams.hr, start, end, (p) => (p.bpm > 0 ? p.bpm : null));
    const eleStart = elevationAt(streams.gps, start);
    const eleEnd = elevationAt(streams.gps, end);
    splits.push({
      km,
      distance_m: Math.round(distance),
      start,
      end,
      movingStart: clock(start),
      movingEnd: clock(end),
      time_s: Math.round(time),
      pace_s_km: Math.round(time / (distance / 1000)),
      avg_hr: hr == null ? null : Math.round(hr),
      cadence_spm: cadence == null ? null : Math.round(cadence),
      elevation_m: eleStart != null && eleEnd != null ? Math.round(eleEnd - eleStart) : null,
    });
    start = end;
  }
  return splits.length >= 2 ? { splits, halves: halves(splits) } : null;
}

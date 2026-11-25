// Route colours based on speed (green = slow, yellow, red =
// fast), relative to the run itself. Pure functions.

import { cumulativeDistance, type TrackPoint } from "./geo.ts";

// Light, well-separated colours: they read well on the dark map too.
const SLOW: [number, number, number] = [74, 222, 128]; // green-400
const MID: [number, number, number] = [250, 204, 21]; // yellow-400
const FAST: [number, number, number] = [239, 68, 68]; // red-500

export const PACE_SCALE = { slow: "#4ade80", mid: "#facc15", fast: "#ef4444" };

function mix(a: [number, number, number], b: [number, number, number], t: number): string {
  const channel = (i: number) => Math.round(a[i] + (b[i] - a[i]) * t).toString(16).padStart(2, "0");
  return `#${channel(0)}${channel(1)}${channel(2)}`;
}

export function speedColor(t: number): string {
  const clamped = Math.min(1, Math.max(0, t));
  return clamped < 0.5 ? mix(SLOW, MID, clamped * 2) : mix(MID, FAST, (clamped - 0.5) * 2);
}

function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)))];
}

/** Stops [progress 0-1, colour] for a gradient along the route; null if the track isn't enough. */
export function paceGradientStops(points: TrackPoint[], stops = 40, windowS = 20): Array<[number, string]> | null {
  if (points.length < 10) return null;
  const cum = cumulativeDistance(points);
  const total = cum[cum.length - 1];
  if (total < 200) return null;

  // Average speed over a window of ±windowS/2 seconds around each point.
  const speeds = points.map((point, index) => {
    let from = index;
    let to = index;
    while (from > 0 && point.t - points[from - 1].t <= windowS / 2) from--;
    while (to < points.length - 1 && points[to + 1].t - point.t <= windowS / 2) to++;
    const dt = points[to].t - points[from].t;
    return dt > 0 ? (cum[to] - cum[from]) / dt : 0;
  });
  const moving = speeds.filter((speed) => speed > 0.5).sort((a, b) => a - b);
  if (moving.length < 5) return null;
  const low = percentile(moving, 0.1);
  const high = percentile(moving, 0.9);
  const span = Math.max(0.1, high - low);

  const out: Array<[number, string]> = [];
  let cursor = 0;
  for (let s = 0; s <= stops; s++) {
    const target = (s / stops) * total;
    while (cursor < cum.length - 1 && cum[cursor] < target) cursor++;
    out.push([s / stops, speedColor((speeds[cursor] - low) / span)]);
  }
  return out;
}

/** Colour for each point of the track (same scale as the gradient), null if the track isn't enough. */
export function pointSpeedColors(points: TrackPoint[], windowS = 20): string[] | null {
  if (points.length < 10) return null;
  const cum = cumulativeDistance(points);
  if (cum[cum.length - 1] < 200) return null;
  const speeds = points.map((point, index) => {
    let from = index;
    let to = index;
    while (from > 0 && point.t - points[from - 1].t <= windowS / 2) from--;
    while (to < points.length - 1 && points[to + 1].t - point.t <= windowS / 2) to++;
    const dt = points[to].t - points[from].t;
    return dt > 0 ? (cum[to] - cum[from]) / dt : 0;
  });
  const moving = speeds.filter((speed) => speed > 0.5).sort((a, b) => a - b);
  if (moving.length < 5) return null;
  const low = percentile(moving, 0.1);
  const span = Math.max(0.1, percentile(moving, 0.9) - low);
  return speeds.map((speed) => speedColor((speed - low) / span));
}

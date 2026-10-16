// Colori del percorso in base alla velocità (scala "calore": giallo = lento,
// rosso = veloce), relativi alla corsa stessa. Funzioni pure.

import { cumulativeDistance, type TrackPoint } from "./geo.ts";

const SLOW: [number, number, number] = [252, 211, 77]; // amber-300
const MID: [number, number, number] = [249, 115, 22]; // orange-500
const FAST: [number, number, number] = [220, 38, 38]; // red-600

export const PACE_SCALE = { slow: "#fcd34d", mid: "#f97316", fast: "#dc2626" };

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

/** Stop [progresso 0-1, colore] per un gradiente lungo il percorso; null se la traccia non basta. */
export function paceGradientStops(points: TrackPoint[], stops = 40, windowS = 20): Array<[number, string]> | null {
  if (points.length < 10) return null;
  const cum = cumulativeDistance(points);
  const total = cum[cum.length - 1];
  if (total < 200) return null;

  // Velocità media su una finestra di ±windowS/2 secondi attorno a ogni punto.
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

/** Colore per ogni punto della traccia (stessa scala del gradiente), null se la traccia non basta. */
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

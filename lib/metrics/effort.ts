// Pure functions: effort metrics derived from the streams. PLAN.md §7.
// Like all of lib/metrics: deterministic, the LLM reads them but does not produce them.

import type { GpsPoint, HrPoint } from "@/lib/types";
import { haversine } from "@/lib/metrics/splits";
import { withoutPauses } from "./pauses.ts";

/** Normalised cadence point (from the FIT parser). */
export interface CadencePoint {
  t: number;
  rpm: number;
}

/**
 * Average cadence in steps/minute. In FIT files running cadence is in
 * revolutions/minute per leg (rpm): for running steps are double; for
 * other sports (bike…) the value stays in rpm as is.
 * Returns null if the series is empty.
 */
export function avgCadenceSpm(
  cadence_series: CadencePoint[] | undefined,
  sport: string,
): number | null {
  if (!cadence_series || cadence_series.length === 0) return null;
  const avg =
    cadence_series.reduce((s, p) => s + p.rpm, 0) / cadence_series.length;
  const factor = sport === "running" ? 2 : 1;
  const spm = Math.round(avg * factor);
  return spm > 0 ? spm : null;
}

/** Mean bpm of the HR samples with t in [t0, t1). */
function avgHrInWindow(hr: HrPoint[], t0: number, t1: number): number | null {
  let sum = 0;
  let n = 0;
  for (const p of hr) {
    if (p.t >= t0 && p.t < t1) {
      sum += p.bpm;
      n++;
    }
  }
  return n > 0 ? sum / n : null;
}

/** Distance (m) covered between t0 and t1 according to the GPS series. */
function distanceInWindow(gps: GpsPoint[], t0: number, t1: number): number {
  let dist = 0;
  for (let i = 1; i < gps.length; i++) {
    const prev = gps[i - 1];
    const curr = gps[i];
    if (prev.t >= t0 && curr.t <= t1) {
      dist += haversine(prev.lat, prev.lon, curr.lat, curr.lon);
    }
  }
  return dist;
}

/**
 * Cardiac drift (aerobic decoupling) in %: compares the speed/HR
 * ratio of the first half with that of the second. Positive = at the same
 * pace the heart rises (fatigue, heat, dehydration, pace too high
 * for the form); ±5% is considered physiological on an easy run.
 *
 * With GPS it uses the true pace/HR decoupling; without GPS it falls back to HR
 * drift alone (second half vs first). Returns null if the session is too
 * short (<20 min) or data is missing: better no number than a
 * noisy one.
 */
export function computeHrDrift(
  hr: HrPoint[] | undefined,
  gps?: GpsPoint[],
): number | null {
  if (!hr || hr.length < 10) return null;
  // Halves computed on moving time: pauses don't skew the pace.
  const moving = withoutPauses({ hr, gps });
  const hr_series = moving.hr!;
  const gps_series = moving.gps ?? undefined;
  const tStart = hr_series[0].t;
  const tEnd = hr_series[hr_series.length - 1].t;
  const total = tEnd - tStart;
  if (total < 20 * 60) return null;

  const tMid = tStart + total / 2;
  const hr1 = avgHrInWindow(hr_series, tStart, tMid);
  const hr2 = avgHrInWindow(hr_series, tMid, tEnd + 1);
  if (hr1 == null || hr2 == null || hr1 <= 0 || hr2 <= 0) return null;

  if (gps_series && gps_series.length >= 4) {
    const d1 = distanceInWindow(gps_series, tStart, tMid);
    const d2 = distanceInWindow(gps_series, tMid, tEnd + 1);
    // Halves too short (long pauses, partial GPS) → HR-only fallback.
    if (d1 > 200 && d2 > 200) {
      const v1 = d1 / (tMid - tStart);
      const v2 = d2 / (tEnd - tMid);
      const eff1 = v1 / hr1; // speed per heartbeat
      const eff2 = v2 / hr2;
      if (eff1 > 0) {
        const drift = ((eff1 - eff2) / eff1) * 100;
        return Math.round(drift * 10) / 10;
      }
    }
  }

  // Fallback: drift of HR alone (assumes roughly constant pace).
  const drift = ((hr2 - hr1) / hr1) * 100;
  return Math.round(drift * 10) / 10;
}

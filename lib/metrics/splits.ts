// Pure function: per-km splits from gps_series. PLAN.md §7.
// If GPS is missing it returns null — no data, no invented numbers.

import type { GpsPoint, HrPoint, Split } from "@/lib/types";
import { withoutPauses } from "./pauses.ts";

/** Haversine distance between two GPS points (meters). */
export function haversine(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Computes per-km splits from a GPS series (and optionally HR).
 * Accumulates meters with Haversine; every 1000 m records km, time (pauses
 * excluded) and average HR.
 * Returns null if the series is empty or has fewer than 2 points.
 */
export function computeSplits(
  gps: GpsPoint[],
  hr?: HrPoint[],
): Split[] | null {
  if (!gps || gps.length < 2) return null;
  // Times on moving time: a watch pause doesn't lengthen the km.
  const moving = withoutPauses({ gps, hr });
  const gps_series = moving.gps!;
  const hr_series = moving.hr ?? undefined;

  const splits: Split[] = [];
  let kmAccum = 0;
  let kmCount = 1;
  let splitStart = gps_series[0].t;
  let hrSum = 0;
  let hrCount = 0;

  // Current index in hr_series for the lookup
  let hrIdx = 0;

  for (let i = 1; i < gps_series.length; i++) {
    const prev = gps_series[i - 1];
    const curr = gps_series[i];
    const seg = haversine(prev.lat, prev.lon, curr.lat, curr.lon);
    const remaining = 1000 - kmAccum;

    // Advance hr_series up to the current time
    if (hr_series) {
      while (hrIdx < hr_series.length && hr_series[hrIdx].t <= curr.t) {
        hrSum += hr_series[hrIdx].bpm;
        hrCount++;
        hrIdx++;
      }
    }

    if (seg >= remaining) {
      // Linear interpolation of the time at the km boundary
      const frac = remaining / seg;
      const tAtBoundary = prev.t + frac * (curr.t - prev.t);

      splits.push({
        km: kmCount,
        time_s: Math.round(tAtBoundary - splitStart),
        ...(hrCount > 0 ? { avg_hr: Math.round(hrSum / hrCount) } : {}),
      });

      kmCount++;
      kmAccum = seg - remaining;
      splitStart = tAtBoundary;
      hrSum = 0;
      hrCount = 0;
    } else {
      kmAccum += seg;
    }
  }

  return splits.length > 0 ? splits : null;
}

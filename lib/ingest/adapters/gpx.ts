// GPX → ActivityInput adapter. PLAN.md §12 + Phase 2.
// Ports to TS the proven parser from scripts/import-gpx.mjs (Strava export).
// Reusable from the import UI and future file uploads.

import { haversine } from "@/lib/metrics/splits";
import type { ActivityInput } from "@/lib/ingest/schema";

interface RawPoint {
  lat: number;
  lon: number;
  ele: number;
  time: string;
  hr: number | null;
}

function parsePoints(xml: string): RawPoint[] {
  const trkptRe = /<trkpt lat="([^"]+)" lon="([^"]+)">([\s\S]*?)<\/trkpt>/g;
  const points: RawPoint[] = [];
  let m: RegExpExecArray | null;
  while ((m = trkptRe.exec(xml)) !== null) {
    const lat = parseFloat(m[1]);
    const lon = parseFloat(m[2]);
    const inner = m[3];
    const ele = parseFloat(
      (inner.match(/<ele>([^<]+)<\/ele>/) ?? [])[1] ?? "0",
    );
    const time = (inner.match(/<time>([^<]+)<\/time>/) ?? [])[1] ?? null;
    const hrRaw = parseInt(
      (inner.match(/<gpxtpx:hr>([^<]+)<\/gpxtpx:hr>/) ?? [])[1] ?? "0",
      10,
    );
    if (time) points.push({ lat, lon, ele, time, hr: hrRaw || null });
  }
  return points;
}

/**
 * Parses a GPX file (Strava format) and produces an ActivityInput ready for ingestActivity.
 * Throws if the file has fewer than 2 trackpoints.
 */
export function parseGpx(xml: string): ActivityInput {
  const trackName =
    (xml.match(/<name>([^<]+)<\/name>/) ?? [])[1]?.trim() ?? "Corsa";

  const points = parsePoints(xml);
  if (points.length < 2) throw new Error("GPX: meno di 2 trackpoint");

  const startTime = new Date(points[0].time);
  const endTime = new Date(points[points.length - 1].time);
  const duration_s = Math.round((endTime.getTime() - startTime.getTime()) / 1000);

  let distance_m = 0;
  let totalEleGain = 0;
  let hrSum = 0;
  let hrCount = 0;
  let hrMax = 0;
  // Estimated "moving" time: Strava GPX doesn't mark pauses, but during
  // auto-pause it stops recording points → they show up as time gaps.
  // We sum the deltas between points, excluding long jumps (recording
  // pauses) and near-standstill stretches (speed below threshold).
  let moving_s = 0;
  const PAUSE_GAP_S = 10; // gap over ~10s = pause/auto-pause
  const MIN_SPEED_MS = 0.5; // below ~0.5 m/s you are effectively stopped

  const gpsSeries: ActivityInput["gps_series"] = [];
  const hrSeries: ActivityInput["hr_series"] = [];

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const t = Math.round((new Date(p.time).getTime() - startTime.getTime()) / 1000);

    if (i > 0) {
      const prev = points[i - 1];
      const segDist = haversine(prev.lat, prev.lon, p.lat, p.lon);
      distance_m += segDist;
      const eleDiff = p.ele - prev.ele;
      if (eleDiff > 0) totalEleGain += eleDiff;

      const dt = (new Date(p.time).getTime() - new Date(prev.time).getTime()) / 1000;
      if (dt > 0) {
        const speed = segDist / dt;
        // Count the stretch as "moving" only if it's not a recording gap
        // (pause) nor a standstill stretch.
        if (dt <= PAUSE_GAP_S && speed >= MIN_SPEED_MS) moving_s += dt;
      }
    }

    gpsSeries.push({ t, lat: p.lat, lon: p.lon, ele: p.ele });

    if (p.hr != null) {
      hrSeries.push({ t, bpm: p.hr });
      hrSum += p.hr;
      hrCount++;
      if (p.hr > hrMax) hrMax = p.hr;
    }
  }

  return {
    source: "file",
    type: "unclassified",
    sport: "running",
    started_at: points[0].time,
    distance_m: Math.round(distance_m),
    duration_s,
    // Only if there was a real pause (moving < elapsed); otherwise leave
    // undefined and use the total time as before.
    moving_time_s:
      moving_s > 0 && Math.round(moving_s) < duration_s
        ? Math.round(moving_s)
        : undefined,
    avg_hr: hrCount > 0 ? Math.round(hrSum / hrCount) : undefined,
    max_hr: hrMax > 0 ? hrMax : undefined,
    elevation_gain_m: Math.round(totalEleGain) || undefined,
    source_title: trackName !== "Corsa" ? trackName : undefined,
    gps_series: gpsSeries,
    hr_series: hrSeries.length > 0 ? hrSeries : undefined,
  };
}

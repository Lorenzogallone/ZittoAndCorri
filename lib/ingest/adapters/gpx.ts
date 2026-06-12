// Adapter GPX → ActivityInput. PLAN.md §12 + Fase 2.
// Porta in TS il parser già collaudato in scripts/import-gpx.mjs (export Strava).
// Riusabile dalla UI di import e da futuri upload file.

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
 * Parsa un file GPX (formato Strava) e produce un ActivityInput pronto per ingestActivity.
 * Lancia se il file ha meno di 2 trackpoint.
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

  const gpsSeries: ActivityInput["gps_series"] = [];
  const hrSeries: ActivityInput["hr_series"] = [];

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const t = Math.round((new Date(p.time).getTime() - startTime.getTime()) / 1000);

    if (i > 0) {
      const prev = points[i - 1];
      distance_m += haversine(prev.lat, prev.lon, p.lat, p.lon);
      const eleDiff = p.ele - prev.ele;
      if (eleDiff > 0) totalEleGain += eleDiff;
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
    type: "easy",
    sport: "running",
    started_at: points[0].time,
    distance_m: Math.round(distance_m),
    duration_s,
    avg_hr: hrCount > 0 ? Math.round(hrSum / hrCount) : undefined,
    max_hr: hrMax > 0 ? hrMax : undefined,
    elevation_gain_m: Math.round(totalEleGain) || undefined,
    notes: trackName !== "Corsa" ? trackName : undefined,
    gps_series: gpsSeries,
    hr_series: hrSeries.length > 0 ? hrSeries : undefined,
  };
}

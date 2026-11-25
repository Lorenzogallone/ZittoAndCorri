// FIT → ActivityInput adapter. Decodes .fit files from Garmin/Coros/Wahoo/
// Amazfit with the official SDK (@garmin/fitsdk) and maps sport/sub_sport onto our
// taxonomy. Like gpx.ts: runs both in the browser (import form) and on the
// server (/api/import/file), produces an ActivityInput ready for ingestActivity.

import type { ActivityInput } from "@/lib/ingest/schema";
import type { Sport } from "@/lib/types";
import { extractFitSessionMetadata } from "./fit-metadata";

/** Semicircles (FIT Sint32) → decimal degrees. */
const SEMICIRCLES_TO_DEG = 180 / 2 ** 31;

/** Maps FIT sport/subSport (SDK camelCase strings) → our taxonomy. */
export function mapFitSport(
  fitSport: string | number | undefined,
  fitSubSport: string | number | undefined,
): Sport {
  const sub = typeof fitSubSport === "string" ? fitSubSport : "";
  // More specific sub-sports win over the generic sport.
  if (sub === "yoga") return "yoga";
  if (sub === "pilates") return "pilates";
  if (sub === "padel") return "padel";

  switch (typeof fitSport === "string" ? fitSport : "") {
    case "running":
      return "running";
    case "cycling":
    case "eBiking":
      return "cycling";
    case "swimming":
      return "swimming";
    case "training":
    case "fitnessEquipment":
    case "hiit":
      return "strength";
    case "hiking":
    case "mountaineering":
      return "hiking";
    case "walking":
      return "walking";
    case "soccer":
      return "soccer";
    case "volleyball":
      return "beach_volley";
    case "tennis":
      return "tennis";
    case "racket":
      return "padel";
    case "alpineSkiing":
    case "crossCountrySkiing":
    case "snowboarding":
    case "snowshoeing":
    case "winterSport":
      return "ski";
    default:
      return "other";
  }
}

/** Readable label of the FIT sport for the notes, e.g. "running / trail". */
function fitSportLabel(
  fitSport: string | number | undefined,
  fitSubSport: string | number | undefined,
): string | undefined {
  const sport = typeof fitSport === "string" ? fitSport : undefined;
  const sub =
    typeof fitSubSport === "string" && fitSubSport !== "generic"
      ? fitSubSport
      : undefined;
  if (!sport) return undefined;
  return sub ? `${sport} / ${sub}` : sport;
}

/**
    * Distance series is useful only if it really grows; beyond 2 hours one point
    * every 2 seconds is kept to avoid bloating the upload (still precise for intervals).
 */
function compactDistance(series: NonNullable<ActivityInput["distance_series"]>): ActivityInput["distance_series"] {
  if (series.length < 10 || series[series.length - 1].d - series[0].d < 50) return undefined;
  if (series.length <= 7200) return series;
  return series.filter((_, index) => index % 2 === 0 || index === series.length - 1);
}

/**
    * Parses a .fit file and produces an ActivityInput ready for ingestActivity.
    * Throws if the file is not a valid FIT or contains no session.
 */
export async function parseFit(buf: ArrayBuffer): Promise<ActivityInput> {
  // Dynamic import: the SDK is heavy, we load it only when the user
  // actually selects a .fit.
  const { Decoder, Stream } = await import("@garmin/fitsdk");

  const stream = Stream.fromArrayBuffer(buf);
  const decoder = new Decoder(stream);
  if (!decoder.isFIT()) throw new Error("FIT: file non riconosciuto");
  if (!decoder.checkIntegrity())
    throw new Error("FIT: file corrotto (CRC non valido)");

  const { messages } = decoder.read({
    applyScaleAndOffset: true,
    convertTypesToStrings: true,
    convertDateTimesToDates: true,
    mergeHeartRates: true,
  });

  const session = messages.sessionMesgs?.[0];
  if (!session) throw new Error("FIT: nessuna sessione trovata nel file");

  const startTime =
    session.startTime instanceof Date
      ? session.startTime
      : messages.recordMesgs?.[0]?.timestamp instanceof Date
        ? messages.recordMesgs[0].timestamp
        : null;
  if (!startTime) throw new Error("FIT: data di inizio mancante");

  const duration_s = Math.round(
    Number(session.totalElapsedTime ?? session.totalTimerTime ?? 0),
  );
  if (duration_s <= 0) throw new Error("FIT: durata non valida");

  const moving_s = Math.round(Number(session.totalTimerTime ?? 0));
  const distance_m = Math.round(Number(session.totalDistance ?? 0));
  const sport = mapFitSport(session.sport, session.subSport);

  // Series from records: HR, GPS (semicircles → degrees) and cadence.
  const gpsSeries: NonNullable<ActivityInput["gps_series"]> = [];
  const hrSeries: NonNullable<ActivityInput["hr_series"]> = [];
  const cadenceSeries: NonNullable<ActivityInput["cadence_series"]> = [];
  const distanceSeries: NonNullable<ActivityInput["distance_series"]> = [];
  let hrMax = 0;

  for (const r of messages.recordMesgs ?? []) {
    if (!(r.timestamp instanceof Date)) continue;
    const t = Math.round((r.timestamp.getTime() - startTime.getTime()) / 1000);
    if (t < 0) continue;

    if (typeof r.positionLat === "number" && typeof r.positionLong === "number") {
      const point: { t: number; lat: number; lon: number; ele?: number } = {
        t,
        lat: r.positionLat * SEMICIRCLES_TO_DEG,
        lon: r.positionLong * SEMICIRCLES_TO_DEG,
      };
      const ele = r.enhancedAltitude ?? r.altitude;
      if (typeof ele === "number") point.ele = ele;
      gpsSeries.push(point);
    }

    if (typeof r.heartRate === "number" && r.heartRate > 0) {
      hrSeries.push({ t, bpm: r.heartRate });
      if (r.heartRate > hrMax) hrMax = r.heartRate;
    }

    if (typeof r.cadence === "number" && r.cadence > 0) {
      cadenceSeries.push({ t, rpm: r.cadence });
    }

    if (typeof r.distance === "number" && r.distance >= 0) {
      distanceSeries.push({ t, d: Math.round(r.distance * 10) / 10 });
    }
  }

  // Laps: needed to separate intervals (lap button or guided workout).
  const round = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null);
  const laps: NonNullable<ActivityInput["laps"]> = (messages.lapMesgs ?? [])
    .filter((lap) => lap.startTime instanceof Date)
    .map((lap) => ({
      start_s: Math.round(((lap.startTime as Date).getTime() - startTime.getTime()) / 1000),
      duration_s: Math.round(Number(lap.totalElapsedTime ?? lap.totalTimerTime ?? 0)),
      distance_m: round(lap.totalDistance),
      avg_hr: round(lap.avgHeartRate) || null,
      max_hr: round(lap.maxHeartRate) || null,
      intensity: typeof lap.intensity === "string" ? lap.intensity : null,
      trigger: typeof lap.lapTrigger === "string" ? lap.lapTrigger : null,
      step: round(lap.wktStepIndex),
    }))
    .filter((lap) => lap.duration_s > 0)
    .slice(0, 500);

  const avgHr =
    typeof session.avgHeartRate === "number" && session.avgHeartRate > 0
      ? Math.round(session.avgHeartRate)
      : hrSeries.length > 0
        ? Math.round(hrSeries.reduce((s, p) => s + p.bpm, 0) / hrSeries.length)
        : undefined;
  const maxHr =
    typeof session.maxHeartRate === "number" && session.maxHeartRate > 0
      ? Math.round(session.maxHeartRate)
      : hrMax > 0
        ? hrMax
        : undefined;

  const elevationGain =
    typeof session.totalAscent === "number" && session.totalAscent > 0
      ? Math.round(session.totalAscent)
      : undefined;
  const calories =
    typeof session.totalCalories === "number" && session.totalCalories > 0
      ? Math.round(session.totalCalories)
      : undefined;

  // FIT workoutRpe uses Borg CR10 multiplied by 10 (e.g. 40 = RPE 4).
  const metadata = extractFitSessionMetadata({
    workoutRpe: session.workoutRpe,
    perceivedExertion: (session as { perceivedExertion?: number }).perceivedExertion,
    sportProfileName: session.sportProfileName,
    workoutName: messages.workoutMesgs?.[0]?.wktName,
  });

  return {
    source: "file",
    type: sport === "running" ? "unclassified" : "cross",
    sport,
    started_at: startTime.toISOString(),
    distance_m,
    duration_s,
    moving_time_s: moving_s > 0 && moving_s < duration_s ? moving_s : undefined,
    avg_hr: avgHr,
    max_hr: maxHr,
    elevation_gain_m: elevationGain,
    calories,
    rpe: metadata.rpe,
    rpe_source: metadata.rpe_source,
    source_title: metadata.source_title || fitSportLabel(session.sport, session.subSport),
    gps_series: gpsSeries.length >= 2 ? gpsSeries : undefined,
    hr_series: hrSeries.length > 0 ? hrSeries : undefined,
    cadence_series: cadenceSeries.length > 0 ? cadenceSeries : undefined,
    distance_series: compactDistance(distanceSeries),
    laps: laps.length > 0 ? laps : undefined,
  };
}

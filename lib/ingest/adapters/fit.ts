// Adapter FIT → ActivityInput. Decodifica i file .fit di Garmin/Coros/Wahoo
// con l'SDK ufficiale (@garmin/fitsdk) e mappa sport/sub_sport sulla nostra
// taxonomy. Come gpx.ts: gira nel browser, produce un ActivityInput pronto
// per ingestActivity.

import type { ActivityInput } from "@/lib/ingest/schema";
import type { Sport } from "@/lib/types";

/** Semicircles (Sint32 FIT) → gradi decimali. */
const SEMICIRCLES_TO_DEG = 180 / 2 ** 31;

/** Mappa sport/subSport FIT (stringhe camelCase dell'SDK) → nostra taxonomy. */
export function mapFitSport(
  fitSport: string | number | undefined,
  fitSubSport: string | number | undefined,
): Sport {
  const sub = typeof fitSubSport === "string" ? fitSubSport : "";
  // I sub-sport più specifici vincono sullo sport generico.
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

/** Label leggibile dello sport FIT per le note, es. "running / trail". */
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
 * Parsa un file .fit e produce un ActivityInput pronto per ingestActivity.
 * Lancia se il file non è un FIT valido o non contiene una sessione.
 */
export async function parseFit(buf: ArrayBuffer): Promise<ActivityInput> {
  // Import dinamico: l'SDK pesa parecchio, lo carichiamo solo quando l'utente
  // seleziona davvero un .fit.
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

  // Serie da record: HR, GPS (semicircles → gradi) e cadenza.
  const gpsSeries: NonNullable<ActivityInput["gps_series"]> = [];
  const hrSeries: NonNullable<ActivityInput["hr_series"]> = [];
  const cadenceSeries: NonNullable<ActivityInput["cadence_series"]> = [];
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
  }

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

  return {
    source: "file",
    type: sport === "running" ? "easy" : "cross",
    sport,
    started_at: startTime.toISOString(),
    distance_m,
    duration_s,
    moving_time_s: moving_s > 0 && moving_s < duration_s ? moving_s : undefined,
    avg_hr: avgHr,
    max_hr: maxHr,
    elevation_gain_m: elevationGain,
    calories,
    notes: fitSportLabel(session.sport, session.subSport),
    gps_series: gpsSeries.length >= 2 ? gpsSeries : undefined,
    hr_series: hrSeries.length > 0 ? hrSeries : undefined,
    cadence_series: cadenceSeries.length > 0 ? cadenceSeries : undefined,
  };
}

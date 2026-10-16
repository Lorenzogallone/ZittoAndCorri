// Mapping puro attività Strava (+ stream) → ActivityInput. Nessun import
// runtime (solo tipi): è testato direttamente con node --test.

import type { ActivityInput } from "@/lib/ingest/schema";
import type { Sport } from "@/lib/types";

/** Campi usati della DetailedActivity di GET /api/v3/activities/{id}. */
export interface StravaActivity {
  id: number;
  name?: string | null;
  sport_type?: string | null;
  /** Deprecato da Strava, fallback se manca sport_type. */
  type?: string | null;
  start_date: string;
  distance?: number | null;
  moving_time?: number | null;
  elapsed_time?: number | null;
  total_elevation_gain?: number | null;
  average_heartrate?: number | null;
  max_heartrate?: number | null;
  calories?: number | null;
  perceived_exertion?: number | null;
  /** Corsa: 0 default, 1 gara, 2 lungo, 3 allenamento. */
  workout_type?: number | null;
}

interface StravaStream<T> {
  data: T[];
}

/** Stream con key_by_type=true (oggetto) — accettato anche il formato array. */
export interface StravaStreams {
  time?: StravaStream<number>;
  latlng?: StravaStream<[number, number]>;
  altitude?: StravaStream<number>;
  heartrate?: StravaStream<number>;
  cadence?: StravaStream<number>;
}

type StravaStreamList = Array<{ type: string; data: unknown[] }>;

const SPORT_MAP: Record<string, Sport> = {
  Run: "running",
  TrailRun: "running",
  VirtualRun: "running",
  Walk: "walking",
  Hike: "hiking",
  Ride: "cycling",
  VirtualRide: "cycling",
  EBikeRide: "cycling",
  GravelRide: "cycling",
  MountainBikeRide: "cycling",
  EMountainBikeRide: "cycling",
  Swim: "swimming",
  WeightTraining: "strength",
  Workout: "strength",
  Crossfit: "strength",
  HighIntensityIntervalTraining: "strength",
  Soccer: "soccer",
  Tennis: "tennis",
  Padel: "padel",
  Yoga: "yoga",
  Pilates: "pilates",
  AlpineSki: "ski",
  BackcountrySki: "ski",
  NordicSki: "ski",
  Snowboard: "ski",
};

/** sport_type Strava → nostra taxonomy. */
export function mapStravaSport(sportType: string | null | undefined): Sport {
  return (sportType && SPORT_MAP[sportType]) || "other";
}

function positiveInt(value: number | null | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const n = Math.round(value);
  return n > 0 ? n : undefined;
}

function round(value: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Normalizza la risposta streams (oggetto key_by_type o array) in oggetto. */
export function normalizeStravaStreams(
  raw: StravaStreams | StravaStreamList | null | undefined,
): StravaStreams {
  if (!raw) return {};
  if (!Array.isArray(raw)) return raw;
  const out: Record<string, { data: unknown[] }> = {};
  for (const s of raw) {
    if (s && typeof s.type === "string" && Array.isArray(s.data)) out[s.type] = { data: s.data };
  }
  return out as StravaStreams;
}

type Series = Pick<ActivityInput, "gps_series" | "hr_series" | "cadence_series">;

/**
 * Stream → serie normalizzate. Scarta i punti non validi (coordinate fuori
 * range o 0,0, HR fuori scala, cadenza nulla). La cadenza resta in giri/min
 * per gamba come nei FIT (Strava la espone così anche per la corsa):
 * avgCadenceSpm la raddoppia per la corsa.
 */
export function mapStravaStreams(raw: StravaStreams | StravaStreamList | null | undefined): Series {
  const streams = normalizeStravaStreams(raw);
  const time = streams.time?.data;
  if (!time || time.length === 0) return {};

  const latlng = streams.latlng?.data;
  const altitude = streams.altitude?.data;
  const heartrate = streams.heartrate?.data;
  const cadence = streams.cadence?.data;

  const gps: NonNullable<ActivityInput["gps_series"]> = [];
  const hr: NonNullable<ActivityInput["hr_series"]> = [];
  const cad: NonNullable<ActivityInput["cadence_series"]> = [];

  for (let i = 0; i < time.length; i++) {
    const t = time[i];
    if (!finite(t) || t < 0) continue;

    const ll = latlng?.[i];
    if (Array.isArray(ll) && finite(ll[0]) && finite(ll[1])) {
      const [lat, lon] = ll;
      const valid =
        Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0);
      if (valid) {
        const point: { t: number; lat: number; lon: number; ele?: number } = {
          t,
          lat: round(lat, 6),
          lon: round(lon, 6),
        };
        const ele = altitude?.[i];
        if (finite(ele)) point.ele = round(ele, 1);
        gps.push(point);
      }
    }

    const bpm = heartrate?.[i];
    if (finite(bpm) && bpm >= 25 && bpm <= 250) hr.push({ t, bpm: Math.round(bpm) });

    const rpm = cadence?.[i];
    if (finite(rpm) && rpm > 0 && rpm < 300) cad.push({ t, rpm: Math.round(rpm) });
  }

  return {
    gps_series: gps.length >= 2 ? gps : undefined,
    hr_series: hr.length > 0 ? hr : undefined,
    cadence_series: cad.length > 0 ? cad : undefined,
  };
}

/**
 * DetailedActivity Strava + stream → ActivityInput pronto per ingestActivity.
 * Lancia se mancano data di inizio o durata.
 */
export function mapStravaActivity(
  activity: StravaActivity,
  streams?: StravaStreams | StravaStreamList | null,
): ActivityInput {
  const startedAt = new Date(activity.start_date);
  if (!activity.start_date || Number.isNaN(startedAt.getTime())) {
    throw new Error("Strava: data di inizio mancante");
  }

  const elapsed = positiveInt(activity.elapsed_time);
  const moving = positiveInt(activity.moving_time);
  const duration_s = elapsed ?? moving;
  if (!duration_s) throw new Error("Strava: durata non valida");

  const distance_m = Math.max(0, Math.round(finite(activity.distance) ? activity.distance : 0));
  let sport = mapStravaSport(activity.sport_type ?? activity.type);
  // Corsa senza distanza (es. tapis roulant senza sensore): il nostro schema
  // la richiede, quindi entra come "altro" e conserva comunque carico e HR.
  if (sport === "running" && distance_m <= 0) sport = "other";

  const series = mapStravaStreams(streams);
  const hrSeries = series.hr_series;

  const avg_hr =
    positiveInt(activity.average_heartrate) ??
    (hrSeries
      ? Math.round(hrSeries.reduce((s, p) => s + p.bpm, 0) / hrSeries.length)
      : undefined);
  const max_hr =
    positiveInt(activity.max_heartrate) ??
    (hrSeries ? hrSeries.reduce((m, p) => Math.max(m, p.bpm), 0) : undefined);

  const rpeRaw = activity.perceived_exertion;
  const rpe = finite(rpeRaw)
    ? Math.min(10, Math.max(1, Math.round(rpeRaw)))
    : undefined;

  const type: ActivityInput["type"] =
    sport !== "running" ? "cross" : activity.workout_type === 1 ? "race" : "unclassified";

  const title = activity.name?.trim();

  return {
    source: "strava",
    external_id: String(activity.id),
    type,
    sport,
    started_at: startedAt.toISOString(),
    distance_m,
    duration_s,
    moving_time_s: moving ? Math.min(moving, duration_s) : undefined,
    avg_hr,
    max_hr,
    elevation_gain_m: positiveInt(activity.total_elevation_gain),
    calories: positiveInt(activity.calories),
    rpe,
    rpe_source: rpe != null ? "api" : undefined,
    source_title: title || undefined,
    ...series,
  };
}

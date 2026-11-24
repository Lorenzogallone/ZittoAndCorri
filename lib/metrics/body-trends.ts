// Funzioni pure: come cambia il corpo nel tempo, dai dati dell'orologio
// (Zepp e Intervals.icu) e dalle corse. Una serie per metrica, un confronto
// tra le ultime 2 settimane e lo stesso periodo di 4 settimane prima, e una
// frase breve su cosa migliora o peggiora. I testi (etichette, frasi,
// spiegazioni) vengono da messages/<lingua>/metrics.json (chiavi body.*).

import { DEFAULT_LOCALE, intlLocale, type Locale, type Translator } from "../../i18n/config.ts";

export interface DayValue {
  date: string;
  value: number;
}

export type BodyMetricKey =
  | "vo2max"
  | "fitness"
  | "load7"
  | "sleep"
  | "sleepDeep"
  | "sleepScore"
  | "restingHr"
  | "hrv"
  | "stress"
  | "spo2"
  | "efficiency"
  | "steps"
  | "pai"
  | "watchLoad"
  | "weight";

export type TrendDirection = "better" | "worse" | "stable" | "up" | "down";

export interface MetricTrend {
  key: BodyMetricKey;
  label: string;
  unit?: string;
  /** Serie in ordine di data. */
  series: DayValue[];
  latest: DayValue | null;
  /** Media delle ultime 2 settimane e delle 2 settimane di 4 settimane prima. */
  recent: number | null;
  previous: number | null;
  direction: TrendDirection | null;
  sentence: string;
}

/** Il valore come lo si legge: «44», «7h 20′», «1,18» (it) / «1.18» (en). */
export function formatMetric(key: BodyMetricKey, value: number, locale: Locale = DEFAULT_LOCALE): string {
  return BODY_METRICS[key].format(value, locale);
}

/** Riga giornaliera di zepp_daily_metrics (solo i campi che servono qui). */
export interface ZeppDayInput {
  date: string;
  vo2_max: number | null;
  training_load: number | null;
  sleep_total_min: number | null;
  sleep_deep_min: number | null;
  sleep_score: number | null;
  resting_hr: number | null;
  stress_avg: number | null;
  spo2_avg: number | null;
  steps: number | null;
  pai_total: number | null;
}

/** Riga giornaliera di wellness_daily (Intervals.icu). */
export interface WellnessDayInput {
  date: string;
  sleep_secs: number | null;
  sleep_score: number | null;
  resting_hr: number | null;
  hrv: number | null;
  stress: number | null;
  spo2: number | null;
  steps: number | null;
  vo2max: number | null;
  weight_kg: number | null;
}

/** Tratti riconosciuti nella corsa (solo quanto serve a capire se era una seduta di qualità). */
export interface RunIntervalsInput {
  source: string;
  segments: Array<{ kind: string; variant: string | null; duration_s: number }>;
}

/** Corsa con quanto serve per l'efficienza aerobica. */
export interface RunInput {
  started_at: string;
  sport: string | null;
  type: string | null;
  distance_m: number | null;
  moving_time_s: number | null;
  duration_s: number | null;
  avg_hr: number | null;
  intervals?: RunIntervalsInput | null;
}

/** Punto del carico interno (computeATLCTL().series). */
export interface LoadPoint {
  date: string;
  load7: number;
  ctl: number;
}

type Better = "up" | "down" | "none";

interface MetricSpec {
  unit?: string;
  better: Better;
  /** Sotto questa differenza (assoluta, o relativa se `relative`) è stabile. */
  stable: number;
  relative?: boolean;
  /** Punti minimi in ciascuna finestra per dire qualcosa. */
  minPoints: number;
  format: (value: number, locale: Locale) => string;
  /**
   * Testi in messages (metrics.body.<chiave>): label e about ci sono sempre.
   * Qui solo quali sono presenti degli altri: cosa vuol dire se migliora
   * (good) / peggiora (bad), e come si chiama il numero grande quando non è
   * un dato giornaliero (latest).
   */
  good?: true;
  bad?: true;
  latest?: true;
}

const decimal = (digits: number) => (value: number, locale: Locale) =>
  value.toLocaleString(intlLocale(locale), { minimumFractionDigits: digits, maximumFractionDigits: digits });
const integer = (value: number, locale: Locale) => Math.round(value).toLocaleString(intlLocale(locale));

export function formatMinutes(value: number): string {
  const minutes = Math.round(value);
  if (minutes < 60) return `${minutes}′`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}′`;
}

export const BODY_METRICS: Record<BodyMetricKey, MetricSpec> = {
  vo2max: { better: "up", stable: 0.5, minPoints: 1, format: (v, locale) => decimal(Number.isInteger(v) ? 0 : 1)(v, locale), good: true, bad: true },
  fitness: { better: "up", stable: 0.06, relative: true, minPoints: 1, format: integer, good: true, bad: true },
  load7: { better: "none", stable: 0.12, relative: true, minPoints: 1, format: integer },
  sleep: { better: "up", stable: 12, minPoints: 3, format: formatMinutes, good: true, bad: true },
  sleepDeep: { better: "up", stable: 6, minPoints: 3, format: formatMinutes, good: true, bad: true },
  sleepScore: { better: "up", stable: 3, minPoints: 3, format: integer },
  restingHr: { unit: "bpm", better: "down", stable: 1, minPoints: 3, format: integer, good: true, bad: true },
  hrv: { unit: "ms", better: "up", stable: 0.05, relative: true, minPoints: 3, format: integer, good: true, bad: true },
  stress: { better: "down", stable: 3, minPoints: 3, format: integer, good: true, bad: true },
  spo2: { unit: "%", better: "up", stable: 0.6, minPoints: 3, format: integer },
  efficiency: { better: "up", stable: 0.025, relative: true, minPoints: 2, format: decimal(2), good: true, bad: true, latest: true },
  steps: { better: "none", stable: 0.1, relative: true, minPoints: 3, format: integer },
  pai: { better: "up", stable: 5, minPoints: 2, format: integer },
  watchLoad: { better: "none", stable: 0.12, relative: true, minPoints: 1, format: integer },
  weight: { unit: "kg", better: "none", stable: 0.5, minPoints: 2, format: decimal(1) },
};

const DAY_MS = 86_400_000;

function dayIndex(date: string): number {
  return Math.round(Date.parse(`${date}T12:00:00Z`) / DAY_MS);
}

function mean(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function valid(value: number | null | undefined, min: number, max: number): number | null {
  return value != null && Number.isFinite(value) && value >= min && value <= max ? value : null;
}

/**
 * Confronta le ultime 2 settimane con le 2 settimane di 4 settimane prima
 * (giorni 28–41 prima di oggi) e scrive la frase.
 */
export function trendFor(key: BodyMetricKey, series: DayValue[], today: string, t: Translator, locale: Locale): MetricTrend {
  const spec = BODY_METRICS[key];
  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
  const end = dayIndex(today);
  const inWindow = (from: number, to: number) =>
    sorted.filter((point) => {
      const age = end - dayIndex(point.date);
      return age >= from && age <= to;
    }).map((point) => point.value);
  const recentValues = inWindow(0, 13);
  const previousValues = inWindow(28, 41);
  const enough = recentValues.length >= spec.minPoints && previousValues.length >= spec.minPoints;
  const recent = enough ? mean(recentValues) : null;
  const previous = enough ? mean(previousValues) : null;
  const latest = sorted.at(-1) ?? null;

  let direction: TrendDirection | null = null;
  if (recent != null && previous != null) {
    const delta = recent - previous;
    const size = spec.relative ? (previous !== 0 ? Math.abs(delta / previous) : 0) : Math.abs(delta);
    if (size < spec.stable) direction = "stable";
    else if (spec.better === "none") direction = delta > 0 ? "up" : "down";
    else direction = (delta > 0) === (spec.better === "up") ? "better" : "worse";
  }

  return {
    key,
    label: t(`body.${key}.label`),
    unit: spec.unit,
    series: sorted,
    latest,
    recent,
    previous,
    direction,
    sentence: sentenceFor(key, spec, direction, recent, previous, latest, t, locale),
  };
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function sentenceFor(
  key: BodyMetricKey,
  spec: MetricSpec,
  direction: TrendDirection | null,
  recent: number | null,
  previous: number | null,
  latest: DayValue | null,
  t: Translator,
  locale: Locale,
): string {
  const unit = spec.unit ? ` ${spec.unit}` : "";
  // Le due medie confrontate, dette per esteso: il numero grande è l'ultimo dato, non una media.
  const range = recent != null && previous != null
    ? t("body.sentence.range", { recent: `${spec.format(recent, locale)}${unit}`, previous: `${spec.format(previous, locale)}${unit}` })
    : "";
  const note = (kind: "good" | "bad") => (spec[kind] ? ` ${capitalize(t(`body.${key}.${kind}`))}.` : "");
  switch (direction) {
    case "better":
      return `${t("body.sentence.better", { range })}${note("good")}`;
    case "worse":
      return `${t("body.sentence.worse", { range })}${note("bad")}`;
    case "up":
      return t("body.sentence.up", { range });
    case "down":
      return t("body.sentence.down", { range });
    case "stable":
      return t("body.sentence.stable", { value: `${spec.format(recent!, locale)}${unit}` });
    default:
      return t(latest ? "body.sentence.notEnough" : "body.sentence.noData");
  }
}

/** Sotto questa quota di tratti veloci (sul tempo della corsa) una corsa riconosciuta in automatico resta facile. */
const AUTO_WORK_SHARE = 0.2;

/**
 * Seduta di qualità (ripetute, soglia, test): ha tratti veloci dichiarati dal
 * piano, dalla nota o dai lap, oppure trovati in automatico per una parte
 * consistente della corsa. Gli allunghi brevi (sprint) non la rendono tale.
 */
export function isQualityRun(run: Pick<RunInput, "intervals" | "moving_time_s" | "duration_s">): boolean {
  const analysis = run.intervals;
  if (!analysis || analysis.source === "none") return false;
  // Allunghi e frammenti di pochi secondi non fanno una seduta di qualità.
  const work = analysis.segments.filter((segment) => segment.kind === "work" && segment.variant !== "sprint" && segment.duration_s >= 30);
  if (!work.length) return false;
  if (analysis.source !== "auto") return true;
  const seconds = run.moving_time_s ?? run.duration_s ?? 0;
  return seconds > 0 && work.reduce((sum, segment) => sum + segment.duration_s, 0) >= seconds * AUTO_WORK_SHARE;
}

/**
 * Oltre questo scarto dalla mediana dell'atleta il valore non è fisiologia ma
 * una lettura sbagliata del cuore (sensore ottico che aggancia la cadenza o
 * perde il battito): 1,30 quando di solito sei a 1,00 non è un giorno buono.
 */
const EFFICIENCY_OUTLIER = 0.25;

/** Valori lontani dalla mediana: letture del cuore sospette, fuori dal trend. */
export function withoutOutliers(points: DayValue[], tolerance = EFFICIENCY_OUTLIER): DayValue[] {
  if (points.length < 5) return points;
  const sorted = points.map((point) => point.value).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  return points.filter((point) => Math.abs(point.value / median - 1) <= tolerance);
}

/** Metri percorsi per battito nelle corse facili: sale quando il fiato migliora. */
export function aerobicEfficiency(runs: RunInput[]): DayValue[] {
  return withoutOutliers(easyRunEfficiency(runs));
}

function easyRunEfficiency(runs: RunInput[]): DayValue[] {
  const easy = new Set(["easy", "long", "recovery", "unclassified"]);
  return runs
    // Quasi tutte le corse arrivano "unclassified": le sedute di qualità si
    // riconoscono dai tratti, altrimenti test e soglie falsano il confronto.
    .filter((run) => run.sport === "running" && (run.type == null || easy.has(run.type)) && !isQualityRun(run))
    .flatMap((run) => {
      const seconds = run.moving_time_s ?? run.duration_s;
      if (!run.distance_m || !seconds || !run.avg_hr || seconds < 20 * 60 || run.avg_hr < 90) return [];
      const metersPerMinute = run.distance_m / (seconds / 60);
      // Fuori scala (camminata, GPS saltato): non è una corsa da confrontare.
      if (metersPerMinute < 120 || metersPerMinute > 400) return [];
      return [{ date: romeDate(run.started_at), value: metersPerMinute / run.avg_hr }];
    });
}

function romeDate(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

/** Media mobile a 7 giorni: una corsa storta non deve far ballare la linea. */
export function rollingMean(series: DayValue[], days = 7): DayValue[] {
  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
  return sorted.map((point, index) => {
    const end = dayIndex(point.date);
    const window = sorted.slice(0, index + 1).filter((other) => end - dayIndex(other.date) < days);
    return { date: point.date, value: mean(window.map((other) => other.value))! };
  });
}

export interface BodyTrendsInput {
  today: string;
  zepp: ZeppDayInput[];
  wellness: WellnessDayInput[];
  runs: RunInput[];
  load: LoadPoint[];
}

/**
 * Tutte le metriche con almeno un dato. Per ogni giorno vale Zepp (l'app
 * sull'orologio) e, dove manca, Intervals.icu; l'HRV arriva solo da Intervals.
 */
export function bodyTrends({ today, zepp, wellness, runs, load }: BodyTrendsInput, t: Translator, locale: Locale): Record<BodyMetricKey, MetricTrend> {
  const byDate = new Map<string, { zepp?: ZeppDayInput; wellness?: WellnessDayInput }>();
  for (const row of zepp) byDate.set(row.date, { ...byDate.get(row.date), zepp: row });
  for (const row of wellness) byDate.set(row.date, { ...byDate.get(row.date), wellness: row });

  const pick = (read: (day: { zepp?: ZeppDayInput; wellness?: WellnessDayInput }) => number | null): DayValue[] =>
    [...byDate.entries()].flatMap(([date, day]) => {
      const value = read(day);
      return value == null ? [] : [{ date, value }];
    });

  const sleepFromWellness = (day: { wellness?: WellnessDayInput }) =>
    day.wellness?.sleep_secs != null ? day.wellness.sleep_secs / 60 : null;
  const recentLoad = load.filter((point) => dayIndex(today) - dayIndex(point.date) <= 120);

  const series: Record<BodyMetricKey, DayValue[]> = {
    vo2max: pick((day) => valid(day.zepp?.vo2_max, 20, 90) ?? valid(day.wellness?.vo2max, 20, 90)),
    fitness: recentLoad.map((point) => ({ date: point.date, value: point.ctl })),
    load7: recentLoad.map((point) => ({ date: point.date, value: point.load7 })),
    sleep: pick((day) => valid(day.zepp?.sleep_total_min, 60, 960) ?? valid(sleepFromWellness(day), 60, 960)),
    sleepDeep: pick((day) => valid(day.zepp?.sleep_deep_min, 1, 600)),
    sleepScore: pick((day) => valid(day.zepp?.sleep_score, 1, 100) ?? valid(day.wellness?.sleep_score, 1, 100)),
    restingHr: pick((day) => valid(day.zepp?.resting_hr, 30, 120) ?? valid(day.wellness?.resting_hr, 30, 120)),
    // Intervals.icu salva 0 quando la notte non ha HRV: non è una misura.
    hrv: pick((day) => valid(day.wellness?.hrv, 1, 300)),
    stress: pick((day) => valid(day.zepp?.stress_avg, 1, 100) ?? valid(day.wellness?.stress, 1, 100)),
    spo2: pick((day) => valid(day.zepp?.spo2_avg, 80, 100) ?? valid(day.wellness?.spo2, 80, 100)),
    efficiency: aerobicEfficiency(runs),
    steps: pick((day) => valid(day.zepp?.steps, 1, 100_000) ?? valid(day.wellness?.steps, 1, 100_000)),
    pai: pick((day) => valid(day.zepp?.pai_total, 0, 1_000)),
    watchLoad: pick((day) => valid(day.zepp?.training_load, 0, 5_000)),
    weight: pick((day) => valid(day.wellness?.weight_kg, 30, 250)),
  };

  return Object.fromEntries(
    (Object.keys(series) as BodyMetricKey[]).map((key) => [key, trendFor(key, series[key], today, t, locale)]),
  ) as Record<BodyMetricKey, MetricTrend>;
}

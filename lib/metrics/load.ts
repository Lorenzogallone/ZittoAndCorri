// Funzioni pure: carico ibrido HR/RPE + finestre mobili ATL/CTL/TSB.
//
// Il punteggio privilegia la risposta cardiaca (minuti pesati per zona), usa
// l'RPE come fallback sulla stessa scala 1-5 e ricorre a una stima prudente
// dalla durata solo quando entrambi mancano. Il carico 7gg è una somma mobile,
// come il Training Load mostrato da Zepp; la scala resta però interna perché
// l'EPOC proprietario di Zepp non è riproducibile dai soli file esportati.

import type { ATLCTLResult, Sport, TimeInZone, ZoneKey } from "@/lib/types";

export interface TrainingLoadActivity {
  started_at: string;
  duration_s: number;
  rpe: number | null;
  avg_hr?: number | null;
  time_in_zone?: TimeInZone | null;
  sport?: Sport | null;
}

export interface TrainingLoadProfile {
  max_hr: number | null;
  resting_hr: number | null;
}

export type SessionLoadSource = "heart_rate" | "rpe" | "estimated";

const ZONE_WEIGHT: Record<ZoneKey, number> = {
  z1: 1,
  z2: 2,
  z3: 3,
  z4: 4,
  z5: 5,
};

const ZONES = Object.keys(ZONE_WEIGHT) as ZoneKey[];

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function fallbackWeight(sport: Sport | null | undefined): number {
  if (sport === "walking" || sport === "yoga" || sport === "pilates") return 1;
  if (["soccer", "beach_volley", "tennis", "padel"].includes(sport ?? "")) return 3;
  return 2;
}

function weightFromAverageHr(
  avgHr: number | null | undefined,
  profile: TrainingLoadProfile | null | undefined,
): number | null {
  if (avgHr == null || profile?.max_hr == null || profile.resting_hr == null) return null;
  const reserve = profile.max_hr - profile.resting_hr;
  if (reserve <= 0) return null;
  const ratio = (avgHr - profile.resting_hr) / reserve;
  if (ratio < 0.6) return 1;
  if (ratio < 0.7) return 2;
  if (ratio < 0.8) return 3;
  if (ratio < 0.9) return 4;
  return 5;
}

function romeDate(timestamp: string): string {
  if (!timestamp.includes("T")) return timestamp.slice(0, 10);
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return timestamp.slice(0, 10);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(parsed);
  const part = (type: string) => parts.find((candidate) => candidate.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function sumRange(values: number[], from: number, to: number): number {
  let sum = 0;
  for (let index = Math.max(0, from); index <= to && index < values.length; index++) {
    sum += values[index];
  }
  return sum;
}

function statusFromRatio(
  ratio: number | null,
): ATLCTLResult["status"] {
  if (ratio == null) return "calibrating";
  if (ratio < 0.9) return "fresh";
  if (ratio <= 1.25) return "balanced";
  if (ratio <= 1.5) return "strained";
  return "fatigued";
}

/**
 * Carico di una sessione su scala interna 1-5 punti/minuto.
 * Priorità: distribuzione HR, HR media, RPE, stima per sport.
 */
export function sessionLoad(
  activity: Omit<TrainingLoadActivity, "started_at">,
  profile?: TrainingLoadProfile | null,
): { load: number; source: SessionLoadSource } {
  const durationMinutes = Math.max(0, activity.duration_s) / 60;
  const zones = activity.time_in_zone;
  if (zones) {
    const coveredSeconds = ZONES.reduce((sum, zone) => sum + Math.max(0, zones[zone] ?? 0), 0);
    if (coveredSeconds > 0) {
      const weightedSeconds = ZONES.reduce(
        (sum, zone) => sum + Math.max(0, zones[zone] ?? 0) * ZONE_WEIGHT[zone],
        0,
      );
      const averageWeight = weightedSeconds / coveredSeconds;
      return { load: Math.round(durationMinutes * averageWeight), source: "heart_rate" };
    }
  }

  const hrWeight = weightFromAverageHr(activity.avg_hr, profile);
  if (hrWeight != null) {
    return { load: Math.round(durationMinutes * hrWeight), source: "heart_rate" };
  }

  if (activity.rpe != null) {
    // RPE 1-10 viene ricondotto alla scala cardiaca 1-5; evita che un RPE
    // mancante o alto renda il fallback due volte più pesante del carico HR.
    const rpeWeight = Math.min(5, Math.max(1, activity.rpe / 2));
    return { load: Math.round(durationMinutes * rpeWeight), source: "rpe" };
  }

  return {
    load: Math.round(durationMinutes * fallbackWeight(activity.sport)),
    source: "estimated",
  };
}

/**
 * Calcola il carico mobile a 7gg, ATL (media 7gg), CTL (media 42gg) e
 * TSB = CTL - ATL. La baseline confronta i 7 giorni correnti con le 3-6
 * settimane precedenti; prima di 21 giorni precedenti lo stato è esplicitamente
 * "in calibrazione" e non emette allarmi di fatica.
 */
export function computeATLCTL(
  activities: TrainingLoadActivity[],
  asOfDate: string = romeDate(new Date().toISOString()),
  profile?: TrainingLoadProfile | null,
): ATLCTLResult {
  if (activities.length === 0) {
    return {
      load7: 0,
      atl: 0,
      ctl: 0,
      tsb: 0,
      baseline7: null,
      load_ratio: null,
      status: "calibrating",
      confidence: "low",
      history_days: 0,
      sources: { heart_rate: 0, rpe: 0, estimated: 0 },
      series: [],
    };
  }

  const loadByDate = new Map<string, number>();
  const sources = { heart_rate: 0, rpe: 0, estimated: 0 };
  for (const a of activities) {
    const date = romeDate(a.started_at);
    if (date > asOfDate) continue;
    const { load, source } = sessionLoad(a, profile);
    loadByDate.set(date, (loadByDate.get(date) ?? 0) + load);
    sources[source] += 1;
  }
  if (loadByDate.size === 0) return computeATLCTL([], asOfDate, profile);

  const sorted = [...loadByDate.keys()].sort();
  const startDate = sorted[0];
  const days: Array<{ date: string; load: number }> = [];
  let cursor = new Date(`${startDate}T12:00:00Z`);
  const end = new Date(`${asOfDate}T12:00:00Z`);
  while (cursor <= end) {
    const d = cursor.toISOString().slice(0, 10);
    days.push({ date: d, load: loadByDate.get(d) ?? 0 });
    cursor = new Date(cursor.getTime() + 86_400_000);
  }

  const dailyLoads = days.map((day) => day.load);
  const series: ATLCTLResult["series"] = [];
  for (let index = 0; index < days.length; index++) {
    const historyDays = index + 1;
    const load7 = sumRange(dailyLoads, index - 6, index);
    const load42 = sumRange(dailyLoads, index - 41, index);
    const atl = load7 / 7;
    // Finché non esiste una finestra cronica completa, il TSB resta neutro:
    // il dato viene dichiarato in calibrazione invece di inventare una forma 0.
    const ctl = historyDays < 42 ? atl : load42 / 42;
    const tsb = ctl - atl;

    const baselineDays = Math.min(42, Math.max(0, index - 6));
    const baselineStart = index - 6 - baselineDays;
    const baselineEnd = index - 7;
    const baselineTotal = baselineDays > 0
      ? sumRange(dailyLoads, baselineStart, baselineEnd)
      : 0;
    const baseline7 = baselineDays >= 21 && baselineTotal > 0
      ? (baselineTotal / baselineDays) * 7
      : null;
    const loadRatio = baseline7 != null && baseline7 > 0 ? load7 / baseline7 : null;

    series.push({
      date: days[index].date,
      daily_load: days[index].load,
      load7: Math.round(load7),
      atl: round1(atl),
      ctl: round1(ctl),
      tsb: round1(tsb),
      baseline7: baseline7 == null ? null : Math.round(baseline7),
      load_ratio: loadRatio == null ? null : round2(loadRatio),
    });
  }

  const last = series[series.length - 1];
  const includedActivities = sources.heart_rate + sources.rpe + sources.estimated;
  const measuredShare = includedActivities > 0 ? sources.heart_rate / includedActivities : 0;
  const confidence: ATLCTLResult["confidence"] = last.baseline7 == null
    ? "low"
    : measuredShare >= 0.6 && days.length >= 42
      ? "high"
      : "medium";
  return {
    load7: last.load7,
    atl: last.atl,
    ctl: last.ctl,
    tsb: last.tsb,
    baseline7: last.baseline7,
    load_ratio: last.load_ratio,
    status: statusFromRatio(last.load_ratio),
    confidence,
    history_days: days.length,
    sources,
    series,
  };
}

/** TSB (freshness) = CTL - ATL. Positivo = fresco, negativo = affaticato. */
export function tsb(ctl: number, atl: number): number {
  return Math.round(ctl - atl);
}

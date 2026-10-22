import type { ATLCTLResult } from "@/lib/types";
import type {
  WellnessDay,
  ZeppDailyMetric,
  ZeppReadinessComponent,
  ZeppReadinessResult,
  ZeppReadinessStatus,
} from "@/lib/zepp/types";

const FRESHNESS_HOURS = 36;

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value));
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function interpolate(value: number, points: Array<[number, number]>): number {
  if (value <= points[0][0]) return points[0][1];
  for (let index = 1; index < points.length; index++) {
    const [x2, y2] = points[index];
    const [x1, y1] = points[index - 1];
    if (value <= x2) {
      const ratio = (value - x1) / (x2 - x1);
      return y1 + ratio * (y2 - y1);
    }
  }
  return points[points.length - 1][1];
}

function statusForScore(score: number): ZeppReadinessStatus {
  if (score >= 80) return "intense";
  if (score >= 65) return "ready";
  if (score >= 50) return "moderate";
  if (score >= 35) return "recovery";
  return "rest";
}

function internalScore(status: ATLCTLResult["status"]): number {
  return {
    calibrating: 65,
    fresh: 90,
    balanced: 75,
    strained: 45,
    fatigued: 20,
  }[status];
}

function component(
  key: ZeppReadinessComponent["key"],
  label: string,
  score: number,
  weight: number,
  value: number | null,
  detail: string,
): ZeppReadinessComponent {
  return { key, label, score: Math.round(clamp(score)), weight, value, detail };
}

/** Punteggio HRV: rMSSD di oggi rispetto alla mediana personale dei giorni precedenti. */
export function hrvScore(today: number, baseline: number | null): number {
  if (baseline == null || baseline <= 0) return 70;
  const ratio = today / baseline;
  if (ratio >= 1) return 90;
  if (ratio >= 0.95) return 80;
  if (ratio >= 0.9) return 65;
  if (ratio >= 0.85) return 45;
  return 25;
}

function hoursSince(captured: string | undefined, now: Date): number | null {
  if (!captured) return null;
  const ms = new Date(captured).getTime();
  return Number.isFinite(ms) ? Math.max(0, (now.getTime() - ms) / 3_600_000) : null;
}

/**
 * Valutazione trasparente: i segnali dell'orologio pesano fino al 95%, il
 * carico interno non supera mai il 5%. I segnali Zepp arrivano dalla Mini App
 * (solo se la connessione è abilitata); sonno, FC a riposo e HRV possono
 * arrivare anche dal wellness giornaliero (Intervals.icu), usato quando Zepp
 * non li fornisce.
 */
export function computeZeppReadiness(
  metrics: ZeppDailyMetric[],
  internal: ATLCTLResult,
  now: Date = new Date(),
  enabled = true,
  wellness: WellnessDay[] = [],
): ZeppReadinessResult {
  const fallback: ZeppReadinessResult = {
    available: false,
    score: null,
    status: null,
    confidence: "low",
    source: "internal",
    freshness_hours: null,
    components: [],
    internal,
  };

  const ordered = enabled ? [...metrics].sort((a, b) => b.captured_at.localeCompare(a.captured_at)) : [];
  const days = [...wellness].sort((a, b) => b.date.localeCompare(a.date));
  const zeppAge = hoursSince(ordered[0]?.captured_at, now);
  const wellnessAge = hoursSince(days[0]?.captured_at, now);
  const ages = [zeppAge, wellnessAge].filter((value): value is number => value != null);
  if (!ages.length) return fallback;
  const freshnessHours = Math.min(...ages);
  if (freshnessHours > FRESHNESS_HOURS) return { ...fallback, freshness_hours: freshnessHours };

  const latest = zeppAge != null && zeppAge <= FRESHNESS_HOURS ? ordered[0] : null;
  const today = wellnessAge != null && wellnessAge <= FRESHNESS_HOURS ? days[0] : null;

  const parts: ZeppReadinessComponent[] = [];
  if (latest?.recovery_raw != null && latest.recovery_raw >= 0) {
    const score = interpolate(latest.recovery_raw, [
      [0, 100], [12, 85], [24, 70], [48, 40], [72, 15], [96, 0],
    ]);
    parts.push(component("recovery", "Recupero Zepp", score, 45, latest.recovery_raw, `${latest.recovery_raw} h residue`));
  }

  if (latest?.training_load != null && latest.training_load >= 0) {
    const history = ordered
      .slice(1, 29)
      .map((row) => row.training_load)
      .filter((value): value is number => value != null && value > 0);
    const baseline = history.length >= 21 ? median(history) : null;
    const ratio = baseline && baseline > 0 ? latest.training_load / baseline : null;
    const score = ratio == null ? 75 : ratio <= 0.6 ? 90 : ratio <= 1.25 ? 85 : ratio <= 1.5 ? 60 : 35;
    parts.push(component("training_load", "Carico Zepp", score, 15, latest.training_load, ratio == null ? "baseline in costruzione" : `${ratio.toFixed(2)}× la mediana`));
  }

  if (today?.hrv != null && today.hrv > 0) {
    const history = days
      .slice(1, 29)
      .map((day) => day.hrv)
      .filter((value): value is number => value != null && value > 0);
    const baseline = history.length >= 5 ? median(history) : null;
    const delta = baseline ? Math.round(((today.hrv - baseline) / baseline) * 100) : null;
    parts.push(component("hrv", "HRV", hrvScore(today.hrv, baseline), 25, today.hrv, delta == null ? `${Math.round(today.hrv)} ms · baseline in costruzione` : `${Math.round(today.hrv)} ms (${delta >= 0 ? "+" : ""}${delta}% sulla mediana)`));
  }

  const sleepScore = latest?.sleep_score ?? today?.sleep_score ?? null;
  const sleepMinutes = latest?.sleep_total_min ?? (today?.sleep_secs != null ? Math.round(today.sleep_secs / 60) : null);
  if (sleepScore != null && sleepScore >= 0 && sleepScore <= 100) {
    parts.push(component("sleep", "Sonno", sleepScore, 20, sleepScore, `${Math.round(sleepScore)}/100`));
  } else if (sleepMinutes != null && sleepMinutes > 0) {
    const hours = sleepMinutes / 60;
    const score = interpolate(hours, [[0, 0], [4, 20], [5, 40], [6, 60], [7, 85], [7.5, 90], [9, 90], [10, 70], [12, 40]]);
    parts.push(component("sleep", "Sonno", score, 20, sleepMinutes, `${hours.toFixed(1)} h`));
  }

  const zeppResting = latest?.resting_hr != null && latest.resting_hr > 0 ? latest.resting_hr : null;
  const restingSeries = zeppResting != null
    ? ordered.slice(1, 15).map((row) => row.resting_hr)
    : days.slice(1, 15).map((day) => day.resting_hr);
  const resting = zeppResting ?? (today?.resting_hr != null && today.resting_hr > 0 ? today.resting_hr : null);
  if (resting != null) {
    const history = restingSeries.filter((value): value is number => value != null && value > 0);
    const baseline = history.length >= 7 ? median(history) : null;
    const delta = baseline == null ? null : resting - baseline;
    const score = delta == null ? 70 : delta <= 0 ? 90 : delta <= 3 ? 75 : delta <= 6 ? 55 : delta <= 9 ? 35 : 15;
    parts.push(component("resting_hr", "HR a riposo", score, 8, resting, delta == null ? "baseline in costruzione" : `${delta >= 0 ? "+" : ""}${Math.round(delta)} bpm`));
  }

  if (latest?.stress_avg != null && latest.stress_avg >= 0 && latest.stress_avg <= 100) {
    parts.push(component("stress", "Stress", 100 - latest.stress_avg, 7, latest.stress_avg, `media ${Math.round(latest.stress_avg)}/100`));
  }

  const hasWorkoutSignal = parts.some((part) => part.key === "recovery" || part.key === "training_load" || part.key === "hrv");
  const hasRecoverySignal = parts.some((part) => ["sleep", "resting_hr", "stress"].includes(part.key));
  if (!hasWorkoutSignal || !hasRecoverySignal) return { ...fallback, freshness_hours: freshnessHours };

  parts.push(component("internal_load", "Carico interno", internalScore(internal.status), 5, internal.load_ratio, internal.status));
  const watchParts = parts.filter((part) => part.key !== "internal_load");
  const availableWeight = watchParts.reduce((sum, part) => sum + part.weight, 0);
  const weighted = watchParts.reduce((sum, part) => sum + part.score * (part.weight / availableWeight), 0);
  const score = Math.round(weighted * 0.95 + parts.at(-1)!.score * 0.05);
  const distinctSignals = watchParts.length;
  const historyDays = Math.max(ordered.length, days.length);
  const usesZepp = latest != null && watchParts.some((part) =>
    part.key === "recovery" || part.key === "training_load" || part.key === "stress"
    || (part.key === "sleep" && (latest.sleep_score != null || latest.sleep_total_min != null))
    || (part.key === "resting_hr" && zeppResting != null));

  return {
    available: true,
    score,
    status: statusForScore(score),
    confidence: distinctSignals >= 5 && historyDays >= 14 ? "high" : distinctSignals >= 3 ? "medium" : "low",
    source: usesZepp ? "zepp_assisted" : "wellness",
    freshness_hours: freshnessHours,
    components: parts,
    internal,
  };
}

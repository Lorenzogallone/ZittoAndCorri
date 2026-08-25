import type { ATLCTLResult } from "@/lib/types";
import type {
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

/**
 * Valutazione trasparente: i segnali Zepp pesano fino al 95%, il carico
 * interno non supera mai il 5%. L'elaborazione parte soltanto per una
 * connessione abilitata esplicitamente dall'utente.
 */
export function computeZeppReadiness(
  metrics: ZeppDailyMetric[],
  internal: ATLCTLResult,
  now: Date = new Date(),
  enabled = true,
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
  if (!enabled || !metrics.length) return fallback;

  const ordered = [...metrics].sort((a, b) => b.captured_at.localeCompare(a.captured_at));
  const latest = ordered[0];
  const capturedMs = new Date(latest.captured_at).getTime();
  if (!Number.isFinite(capturedMs)) return fallback;
  const freshnessHours = Math.max(0, (now.getTime() - capturedMs) / 3_600_000);
  if (freshnessHours > FRESHNESS_HOURS) return { ...fallback, freshness_hours: freshnessHours };

  const parts: ZeppReadinessComponent[] = [];
  if (latest.recovery_raw != null && latest.recovery_raw >= 0) {
    const score = interpolate(latest.recovery_raw, [
      [0, 100], [12, 85], [24, 70], [48, 40], [72, 15], [96, 0],
    ]);
    parts.push(component("recovery", "Recupero Zepp", score, 45, latest.recovery_raw, `${latest.recovery_raw} h residue`));
  }

  if (latest.training_load != null && latest.training_load >= 0) {
    const history = ordered
      .slice(1, 29)
      .map((row) => row.training_load)
      .filter((value): value is number => value != null && value > 0);
    const baseline = history.length >= 21 ? median(history) : null;
    const ratio = baseline && baseline > 0 ? latest.training_load / baseline : null;
    const score = ratio == null ? 75 : ratio <= 0.6 ? 90 : ratio <= 1.25 ? 85 : ratio <= 1.5 ? 60 : 35;
    parts.push(component("training_load", "Carico Zepp", score, 15, latest.training_load, ratio == null ? "baseline in costruzione" : `${ratio.toFixed(2)}× la mediana`));
  }

  if (latest.sleep_score != null && latest.sleep_score >= 0 && latest.sleep_score <= 100) {
    parts.push(component("sleep", "Sonno", latest.sleep_score, 20, latest.sleep_score, `${Math.round(latest.sleep_score)}/100`));
  } else if (latest.sleep_total_min != null && latest.sleep_total_min > 0) {
    const hours = latest.sleep_total_min / 60;
    const score = interpolate(hours, [[0, 0], [4, 20], [5, 40], [6, 60], [7, 85], [7.5, 90], [9, 90], [10, 70], [12, 40]]);
    parts.push(component("sleep", "Sonno", score, 20, latest.sleep_total_min, `${hours.toFixed(1)} h`));
  }

  if (latest.resting_hr != null && latest.resting_hr > 0) {
    const history = ordered
      .slice(1, 15)
      .map((row) => row.resting_hr)
      .filter((value): value is number => value != null && value > 0);
    const baseline = history.length >= 7 ? median(history) : null;
    const delta = baseline == null ? null : latest.resting_hr - baseline;
    const score = delta == null ? 70 : delta <= 0 ? 90 : delta <= 3 ? 75 : delta <= 6 ? 55 : delta <= 9 ? 35 : 15;
    parts.push(component("resting_hr", "HR a riposo", score, 8, latest.resting_hr, delta == null ? "baseline in costruzione" : `${delta >= 0 ? "+" : ""}${Math.round(delta)} bpm`));
  }

  if (latest.stress_avg != null && latest.stress_avg >= 0 && latest.stress_avg <= 100) {
    parts.push(component("stress", "Stress", 100 - latest.stress_avg, 7, latest.stress_avg, `media ${Math.round(latest.stress_avg)}/100`));
  }

  const hasWorkoutSignal = parts.some((part) => part.key === "recovery" || part.key === "training_load");
  const hasRecoverySignal = parts.some((part) => ["sleep", "resting_hr", "stress"].includes(part.key));
  if (!hasWorkoutSignal || !hasRecoverySignal) return { ...fallback, freshness_hours: freshnessHours };

  parts.push(component("internal_load", "Carico interno", internalScore(internal.status), 5, internal.load_ratio, internal.status));
  const zeppParts = parts.filter((part) => part.key !== "internal_load");
  const availableZeppWeight = zeppParts.reduce((sum, part) => sum + part.weight, 0);
  const weightedZepp = zeppParts.reduce((sum, part) => sum + part.score * (part.weight / availableZeppWeight), 0);
  const score = Math.round(weightedZepp * 0.95 + parts.at(-1)!.score * 0.05);
  const distinctZeppSignals = zeppParts.length;

  return {
    available: true,
    score,
    status: statusForScore(score),
    confidence: distinctZeppSignals >= 5 && ordered.length >= 14 ? "high" : distinctZeppSignals >= 3 ? "medium" : "low",
    source: "zepp_assisted",
    freshness_hours: freshnessHours,
    components: parts,
    internal,
  };
}

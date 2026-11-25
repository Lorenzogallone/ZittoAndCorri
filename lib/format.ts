// Presentation and input-parsing helpers. No metrics: formatting only.

import { DEFAULT_LOCALE, intlLocale, type Locale, type Translator } from "../i18n/config.ts";

/** Seconds/km → "m:ss/km". */
export function formatPace(s_km: number | null | undefined): string {
  if (s_km == null) return "—";
  const m = Math.floor(s_km / 60);
  const s = Math.round(s_km % 60);
  return `${m}:${s.toString().padStart(2, "0")}/km`;
}

/** Seconds → "h:mm:ss" (or "m:ss" if < 1h). */
export function formatDuration(total_s: number | null | undefined): string {
  if (total_s == null) return "—";
  const h = Math.floor(total_s / 3600);
  const m = Math.floor((total_s % 3600) / 60);
  const s = Math.round(total_s % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Meters → "X,XX km" (it) / "X.XX km" (en): the decimal separator follows the language. */
export function formatDistance(distance_m: number | null | undefined, locale: Locale = DEFAULT_LOCALE): string {
  if (distance_m == null) return "—";
  const km = (distance_m / 1000).toLocaleString(intlLocale(locale), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: false,
  });
  return `${km} km`;
}

/**
    * "Effective" time of an activity: moving time (pauses excluded) if
    * available, otherwise total time. It is the time Strava shows, used
    * everywhere for duration, totals and load.
 */
export function activeDuration(a: {
  duration_s: number;
  moving_time_s?: number | null;
}): number {
  return a.moving_time_s ?? a.duration_s;
}

/**
    * Distance in km of a planned workout: the explicit one if present,
    * otherwise estimated from duration and pace (for time/pace targets). Handy to
    * always show the km even when the coach sets the target as pace or
    * duration. Returns meters and whether it is an estimate; null if not computable.
 */
export function plannedDistanceM(w: {
  target_distance_m?: number | null;
  target_duration_s?: number | null;
  target_pace_s_km?: number | null;
}): { meters: number; estimated: boolean } | null {
  if (w.target_distance_m != null) {
    return { meters: w.target_distance_m, estimated: false };
  }
  if (
    w.target_duration_s != null &&
    w.target_pace_s_km != null &&
    w.target_pace_s_km > 0
  ) {
    return {
      meters: Math.round((w.target_duration_s / w.target_pace_s_km) * 1000),
      estimated: true,
    };
  }
  return null;
}

/** "X,XX km" preceded by ~ if the distance is estimated from duration and pace. */
export function formatPlannedDistance(
  w: {
    target_distance_m?: number | null;
    target_duration_s?: number | null;
    target_pace_s_km?: number | null;
  },
  locale: Locale = DEFAULT_LOCALE,
): string | null {
  const d = plannedDistanceM(w);
  if (!d) return null;
  return `${d.estimated ? "~" : ""}${formatDistance(d.meters, locale)}`;
}

/** Whole days remaining until raceDate (min 0). Null if raceDate is null. */
export function daysUntil(raceDate: string | null | undefined): number | null {
  if (!raceDate) return null;
  const diff = new Date(raceDate).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (24 * 3600 * 1000)));
}

/** "142 days" / "1 day" / "Today!" (`t` bound to the "metrics" namespace). */
export function countdownLabel(raceDate: string | null | undefined, t: Translator): string | null {
  const d = daysUntil(raceDate);
  if (d === null) return null;
  return d === 0 ? t("countdown.today") : t("countdown.days", { count: d });
}

/**
    * "h:mm:ss" | "mm:ss" | "ss" → seconds. Returns null if not parsable.
    * "." and "," also count as separators: the iOS decimal keyboard (fields
    * with inputMode="decimal") has no colon, so "5,30" means 5:30.
 */
export function parseDuration(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(/[:.,]/).map((p) => p.trim());
  if (parts.some((p) => p === "" || !/^\d+$/.test(p))) return null;
  const nums = parts.map(Number);
  let h = 0;
  let m = 0;
  let s = 0;
  if (nums.length === 3) [h, m, s] = nums;
  else if (nums.length === 2) [m, s] = nums;
  else if (nums.length === 1) [s] = nums;
  else return null;
  if (s >= 60 || m >= 60) return null;
  return h * 3600 + m * 60 + s;
}

/**
    * Decimal number typed by a user: accepts the comma (Italian iOS decimal
    * keyboard) as well as the dot. Same semantics as `Number()` otherwise
    * ("" → 0, invalid text → NaN).
 */
export function parseDecimal(input: unknown): number {
  return Number(String(input ?? "").trim().replace(",", "."));
}

/** HTML `pattern` for decimal fields (km): dot or comma. */
export const DECIMAL_PATTERN = "\\d+([.,]\\d+)?";
/** HTML `pattern` for durations and paces ("5:30", "1:45:00", "5,30"): see parseDuration. */
export const DURATION_PATTERN = "\\d+([:.,]\\d{1,2}){0,2}";

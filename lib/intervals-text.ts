// Texts for the segments of a session, in Italian for the AI coach (context and
// prompt). The UI uses the same translated labels: messages/*/status.json, intervals.*.

import type { IntervalAnalysis, IntervalSegment, IntervalSource } from "./metrics/intervals.ts";
import { formatDuration, formatPace } from "./format.ts";

export const INTERVAL_SOURCE_LABELS: Record<IntervalSource, string> = {
  laps: "dai lap dell'orologio",
  notes: "dalla tua nota",
  plan: "dal piano",
  auto: "riconosciute in automatico",
};

/** The kind of continuous run the plan asked for, for the UI and for the coach. */
export const PLANNED_CONTINUOUS_LABELS = { long: "un lungo", easy: "una corsa facile", recovery: "un recupero" } as const;

/**
 * The coach reads plan, splits, HR and notes: if it says it was a continuous run,
 * repeats found only by automatic detection are not shown. Laps,
 * note and plan stay (there someone declared the structure), and so do
 * the strides of an easy run.
 */
export function withCoachVerdict(
  analysis: IntervalAnalysis | null,
  flags: Record<string, boolean> | null | undefined,
): IntervalAnalysis | null {
  // Only strides: not repeats, but in a continuous run they must be shown.
  if (analysis?.source !== "auto" || analysis.summary?.main === "sprint") return analysis;
  return flags?.structured_session === false ? null : analysis;
}

export const hasIntervals = (analysis: IntervalAnalysis | null | undefined): analysis is IntervalAnalysis =>
  !!analysis && analysis.source !== "none" && analysis.segments.some((segment) => segment.kind === "work");

const pace = (seconds: number | null) => (seconds == null ? null : formatPace(seconds).replace("/km", ""));

function segmentLine(segment: IntervalSegment, index: number): string {
  const name = `${segment.label}${segment.rep ? ` ${segment.rep}/${segment.reps}` : ""}`;
  const parts = [
    formatDuration(segment.duration_s),
    segment.distance_m ? `${segment.distance_m} m` : null,
    segment.pace_s_km ? `${pace(segment.pace_s_km)}/km` : null,
    segment.variant === "sprint" && segment.max_speed_kmh ? `punta ${String(segment.max_speed_kmh).replace(".", ",")} km/h` : null,
    segment.avg_hr ? `FC ${segment.avg_hr}${segment.max_hr ? ` (max ${segment.max_hr})` : ""}` : null,
    segment.hr_drop != null && segment.hr_drop > 0 ? `FC −${segment.hr_drop} nel recupero` : null,
    segment.cadence_spm ? `cadenza ${segment.cadence_spm} spm` : null,
    (segment.paused_s ?? 0) >= 5 ? `più ${formatDuration(segment.paused_s!)} di pausa (fuori da tempo e passo)` : null,
    segment.pace_deviation_s ? `${segment.pace_deviation_s > 0 ? "+" : "−"}${Math.abs(segment.pace_deviation_s)}″/km dal range previsto` : null,
    segment.pace_deviation_s === 0 ? "nel range previsto" : null,
  ].filter(Boolean);
  return `${index}. ${name}: ${parts.join(", ")}`;
}

/** How the recoveries were done: "recuperi: 4 jogging, 3 camminata". */
function recoveryMix(analysis: IntervalAnalysis): string | null {
  const counts = new Map<string, number>();
  for (const segment of analysis.segments) {
    if (segment.kind !== "recovery" || !segment.variant) continue;
    const name = { jog: "jogging", walk: "camminata", stop: "da fermo", sprint: "sprint" }[segment.variant];
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return counts.size ? `recuperi: ${[...counts].map(([name, count]) => `${count} ${name}`).join(", ")}` : null;
}

/** Cadence in the fast segments, first vs last: drops when technique gives way to fatigue. */
function cadenceTrend(analysis: IntervalAnalysis): string | null {
  const work = analysis.segments.filter((segment) => segment.kind === "work" && segment.variant !== "sprint" && segment.cadence_spm);
  if (!work.length) return null;
  const first = work[0].cadence_spm!;
  const last = work[work.length - 1].cadence_spm!;
  return work.length > 1 && first !== last
    ? `cadenza nei tratti veloci da ${first} a ${last} spm`
    : `cadenza nei tratti veloci ${first} spm`;
}

/** Pauses within the segments (watch stopped or stops), excluded from times and paces. */
function pauseTotal(analysis: IntervalAnalysis): string | null {
  const seconds = analysis.segments.reduce((sum, segment) => sum + (segment.paused_s ?? 0), 0);
  return seconds >= 10 ? `${formatDuration(seconds)} di pause escluse da tempi e passi` : null;
}

/** One-line summary, for the coach context (recent history). */
export function intervalsOneLine(analysis: IntervalAnalysis | null | undefined): string | null {
  if (!hasIntervals(analysis)) return null;
  const s = analysis.summary;
  const bits = [
    s?.avg_pace_s_km ? `media tratti veloci ${pace(s.avg_pace_s_km)}/km` : null,
    s?.fastest_pace_s_km && s.slowest_pace_s_km && s.fastest_pace_s_km !== s.slowest_pace_s_km
      ? `da ${pace(s.fastest_pace_s_km)} a ${pace(s.slowest_pace_s_km)}/km`
      : null,
    s?.fade_pct != null ? `ultima vs prima ${s.fade_pct > 0 ? "+" : ""}${String(s.fade_pct).replace(".", ",")}%` : null,
    s?.avg_hr ? `FC media nei tratti ${s.avg_hr}` : null,
    s?.sprint
      ? `${s.sprint.count} sprint${s.sprint.avg_pace_s_km ? ` a ${pace(s.sprint.avg_pace_s_km)}/km` : ""}${s.sprint.max_speed_kmh ? `, punta ${String(s.sprint.max_speed_kmh).replace(".", ",")} km/h` : ""}`
      : null,
    recoveryMix(analysis),
    cadenceTrend(analysis),
    pauseTotal(analysis),
  ].filter(Boolean);
  const head = analysis.description ?? `${s?.work_count ?? 0} tratti veloci`;
  const against = analysis.contradicts_plan ? `; il piano chiedeva ${PLANNED_CONTINUOUS_LABELS[analysis.contradicts_plan]}` : "";
  return `${head} (${INTERVAL_SOURCE_LABELS[analysis.source as IntervalSource]}${against})${bits.length ? `: ${bits.join(", ")}` : ""}`;
}

/** Table of segments for the evaluation of a single run. */
export function intervalsForPrompt(analysis: IntervalAnalysis | null | undefined): string | null {
  if (!hasIntervals(analysis)) return null;
  const main = analysis.segments.filter((segment) => segment.kind !== "warmup" && segment.kind !== "cooldown");
  const warmup = analysis.segments.find((segment) => segment.kind === "warmup");
  const cooldown = [...analysis.segments].reverse().find((segment) => segment.kind === "cooldown");
  return [
    `Tratti della seduta misurati sul file: ${intervalsOneLine(analysis)}.`,
    warmup ? `Riscaldamento ${formatDuration(warmup.duration_s)}${warmup.pace_s_km ? ` a ${pace(warmup.pace_s_km)}/km` : ""}.` : "",
    ...main.map((segment, index) => segmentLine(segment, index + 1)),
    cooldown ? `Defaticamento ${formatDuration(cooldown.duration_s)}${cooldown.pace_s_km ? ` a ${pace(cooldown.pace_s_km)}/km` : ""}.` : "",
  ].filter(Boolean).join("\n");
}

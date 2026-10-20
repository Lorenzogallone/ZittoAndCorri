// Testi per i tratti di una seduta: etichette per la UI e righe per il coach AI.

import type { IntervalAnalysis, IntervalSegment, IntervalSource } from "./metrics/intervals.ts";
import { formatDuration, formatPace } from "./format.ts";

export const INTERVAL_SOURCE_LABELS: Record<IntervalSource, string> = {
  laps: "dai lap dell'orologio",
  notes: "dalla tua nota",
  plan: "dal piano",
  auto: "riconosciute in automatico",
};

export const hasIntervals = (analysis: IntervalAnalysis | null | undefined): analysis is IntervalAnalysis =>
  !!analysis && analysis.source !== "none" && analysis.segments.some((segment) => segment.kind === "work");

const pace = (seconds: number | null) => (seconds == null ? null : formatPace(seconds).replace("/km", ""));

function segmentLine(segment: IntervalSegment, index: number): string {
  const name = `${segment.label}${segment.rep ? ` ${segment.rep}/${segment.reps}` : ""}`;
  const parts = [
    formatDuration(segment.duration_s),
    segment.distance_m ? `${segment.distance_m} m` : null,
    segment.pace_s_km ? `${pace(segment.pace_s_km)}/km` : null,
    segment.avg_hr ? `FC ${segment.avg_hr}${segment.max_hr ? ` (max ${segment.max_hr})` : ""}` : null,
    segment.hr_drop != null && segment.hr_drop > 0 ? `FC −${segment.hr_drop} nel recupero` : null,
    segment.pace_deviation_s ? `${segment.pace_deviation_s > 0 ? "+" : "−"}${Math.abs(segment.pace_deviation_s)}″/km dal range previsto` : null,
    segment.pace_deviation_s === 0 ? "nel range previsto" : null,
  ].filter(Boolean);
  return `${index}. ${name}: ${parts.join(", ")}`;
}

/** Riepilogo in una riga, per il contesto del coach (storico recente). */
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
  ].filter(Boolean);
  const head = analysis.description ?? `${s?.work_count ?? 0} tratti veloci`;
  return `${head} (${INTERVAL_SOURCE_LABELS[analysis.source as IntervalSource]})${bits.length ? `: ${bits.join(", ")}` : ""}`;
}

/** Tabella dei tratti per la valutazione della singola corsa. */
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

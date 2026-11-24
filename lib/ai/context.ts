// Righe compatte di contesto per i prompt. Riusa SOLO funzioni deterministiche:
// l'LLM legge questi numeri, non li produce.
import "server-only";
import { zoneForHr } from "@/lib/metrics/zones";
import { formatPace, formatDuration, formatDistance } from "@/lib/format";
import type { Activity, Profile, ActivityType } from "@/lib/types";
import { TYPE_LABELS_IT, SPORT_LABELS_IT } from "@/lib/activity-meta";

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
  });
}

/** Riga di dettaglio compatta di una singola attività, per la valutazione. */
export function activityDetailLine(
  a: {
    started_at: string;
    type: ActivityType;
    sport?: Activity["sport"] | null;
    distance_m: number;
    duration_s: number;
    avg_pace_s_km: number | null;
    avg_hr: number | null;
    max_hr: number | null;
    rpe: number | null;
    elevation_gain_m: number | null;
    hr_drift_pct?: number | null;
    avg_cadence_spm?: number | null;
    time_in_zone?: Activity["time_in_zone"];
    notes: string | null;
  },
  profile?: Pick<Profile, "max_hr" | "resting_hr"> | null,
): string {
  const isRun = (a.sport ?? "running") === "running";
  const head = isRun
    ? TYPE_LABELS_IT[a.type]
    : `${SPORT_LABELS_IT[a.sport ?? "other"]} (non corsa)`;
  const parts = [
    `${head}${a.distance_m > 0 ? ` ${formatDistance(a.distance_m)}` : ""}`,
    `durata ${formatDuration(a.duration_s)}`,
  ];
  if (a.avg_pace_s_km != null) parts.push(`passo ${formatPace(a.avg_pace_s_km)}`);
  if (a.avg_hr) {
    const zone = profile ? zoneForHr(a.avg_hr, profile) : null;
    parts.push(`HR media ${a.avg_hr}${zone ? ` (${zone.toUpperCase()})` : ""}`);
  }
  if (a.max_hr) parts.push(`HR max ${a.max_hr}`);
  if (a.hr_drift_pct != null) {
    parts.push(
      `deriva cardiaca ${a.hr_drift_pct > 0 ? "+" : ""}${a.hr_drift_pct}%`,
    );
  }
  if (a.avg_cadence_spm) parts.push(`cadenza ${a.avg_cadence_spm} spm`);
  if (a.elevation_gain_m) parts.push(`disl +${a.elevation_gain_m}m`);
  if (a.rpe) parts.push(`RPE ${a.rpe}/10`);
  let line = `${shortDate(a.started_at)} — ${parts.join(", ")}.`;
  // Distribuzione del tempo per zona HR: più informativa della sola media.
  if (a.time_in_zone && Object.keys(a.time_in_zone).length > 0) {
    const zoneParts = (["z1", "z2", "z3", "z4", "z5"] as const)
      .filter((z) => (a.time_in_zone?.[z] ?? 0) >= 60)
      .map((z) => `${z.toUpperCase()} ${formatDuration(a.time_in_zone![z]!)}`);
    if (zoneParts.length > 0) line += ` Tempo in zona: ${zoneParts.join(" · ")}.`;
  }
  if (a.notes) line += ` Note atleta: "${a.notes}"`;
  return line;
}

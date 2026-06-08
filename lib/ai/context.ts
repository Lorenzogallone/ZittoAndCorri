// Costruisce il digest compatto dell'atleta da allegare ai prompt. PLAN.md §8.
// Riusa SOLO funzioni deterministiche di lib/metrics: l'LLM legge questi numeri,
// non li produce. Niente stream HR/GPS nel prompt (§3).
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { predictRaces } from "@/lib/metrics/predict";
import { computeATLCTL } from "@/lib/metrics/load";
import { computeAdherence } from "@/lib/metrics/adherence";
import { formatPace, formatDuration, formatDistance } from "@/lib/format";
import type {
  Activity,
  Goal,
  PlannedWorkout,
  Profile,
  PlannedStatus,
  WorkoutType,
} from "@/lib/types";

const TYPE_LABELS: Record<WorkoutType, string> = {
  easy: "Easy",
  tempo: "Tempo",
  interval: "Ripetute",
  long: "Lungo",
  race: "Gara",
  recovery: "Recupero",
  cross: "Cross",
};

type CtxActivity = Pick<
  Activity,
  | "started_at"
  | "type"
  | "distance_m"
  | "duration_s"
  | "avg_pace_s_km"
  | "avg_hr"
  | "rpe"
  | "notes"
>;

export interface AthleteContext {
  /** Markdown compatto (~400-600 token) da mettere nel prompt. */
  markdown: string;
  /** Obiettivo attivo, per collegare i workout generati. */
  activeGoal: Pick<
    Goal,
    "id" | "race_name" | "race_date" | "distance_m" | "target_time_s"
  > | null;
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
  });
}

/** Migliore prestazione di riferimento: la corsa col 10k-equivalente più veloce. */
function bestReference(acts: CtxActivity[]): { distance_m: number; duration_s: number } | null {
  let best: { distance_m: number; duration_s: number } | null = null;
  let bestEquiv = Infinity;
  for (const a of acts) {
    if (a.distance_m < 1000 || a.duration_s <= 0) continue;
    // Riegel verso 10k come metro di paragone omogeneo
    const equiv = a.duration_s * (10_000 / a.distance_m) ** 1.06;
    if (equiv < bestEquiv) {
      bestEquiv = equiv;
      best = { distance_m: a.distance_m, duration_s: a.duration_s };
    }
  }
  return best;
}

/** Passo medio per tipo di allenamento (s/km). */
function pacePerType(acts: CtxActivity[]): Partial<Record<WorkoutType, number>> {
  const sum: Partial<Record<WorkoutType, { p: number; n: number }>> = {};
  for (const a of acts) {
    if (a.avg_pace_s_km == null) continue;
    const e = (sum[a.type] ??= { p: 0, n: 0 });
    e.p += a.avg_pace_s_km;
    e.n += 1;
  }
  const out: Partial<Record<WorkoutType, number>> = {};
  for (const [t, e] of Object.entries(sum)) {
    if (e && e.n > 0) out[t as WorkoutType] = Math.round(e.p / e.n);
  }
  return out;
}

export async function buildAthleteContext(
  supabase: SupabaseClient,
  userId: string,
): Promise<AthleteContext> {
  const today = new Date().toISOString().slice(0, 10);
  const since42 = isoDaysAgo(42);
  const fourteenAgo = isoDaysAgo(14);

  const [
    { data: profile },
    { data: goal },
    { data: acts },
    { data: recentPlanned },
    { data: upcomingPlanned },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, max_hr, resting_hr, birthdate")
      .eq("id", userId)
      .maybeSingle<Profile>(),
    supabase
      .from("goals")
      .select("id, race_name, race_date, distance_m, target_time_s")
      .eq("user_id", userId)
      .eq("is_active", true)
      .maybeSingle<
        Pick<Goal, "id" | "race_name" | "race_date" | "distance_m" | "target_time_s">
      >(),
    supabase
      .from("activities")
      .select("started_at, type, distance_m, duration_s, avg_pace_s_km, avg_hr, rpe, notes")
      .eq("user_id", userId)
      .gte("started_at", `${since42}T00:00:00`)
      .order("started_at", { ascending: true })
      .returns<CtxActivity[]>(),
    supabase
      .from("planned_workouts")
      .select("status, date")
      .eq("user_id", userId)
      .gte("date", fourteenAgo)
      .lte("date", today)
      .returns<Array<{ status: PlannedStatus; date: string }>>(),
    supabase
      .from("planned_workouts")
      .select("date, type, target_distance_m, target_duration_s, description")
      .eq("user_id", userId)
      .gt("date", today)
      .order("date")
      .returns<
        Pick<
          PlannedWorkout,
          "date" | "type" | "target_distance_m" | "target_duration_s" | "description"
        >[]
      >(),
  ]);

  const activities = acts ?? [];
  const lines: string[] = [];

  // Intestazione obiettivo
  if (goal) {
    const weeksLeft = goal.race_date
      ? Math.max(
          0,
          Math.ceil(
            (new Date(goal.race_date).getTime() - Date.now()) / (7 * 86_400_000),
          ),
        )
      : null;
    lines.push(
      `## Atleta — agg. ${shortDate(today)}`,
      `Obiettivo: ${goal.race_name}${
        goal.race_date ? `, ${shortDate(goal.race_date)}` : ""
      }${weeksLeft != null ? ` (${weeksLeft} sett.)` : ""}. ${
        goal.distance_m ? formatDistance(goal.distance_m) : ""
      }${goal.target_time_s ? ` · Target ${formatDuration(goal.target_time_s)}` : ""}`,
    );
  } else {
    lines.push(`## Atleta — agg. ${shortDate(today)}`, `Nessun obiettivo attivo.`);
  }

  // Predizioni Riegel
  const best = bestReference(activities);
  if (best) {
    try {
      const p = predictRaces(best, goal?.distance_m);
      const parts = [
        `5k ${formatDuration(p["5k"])}`,
        `10k ${formatDuration(p["10k"])}`,
        `half ${formatDuration(p.half)}`,
      ];
      if (p.target != null) parts.push(`target ${formatDuration(p.target)}`);
      lines.push(`Predizioni (Riegel): ${parts.join(" · ")}.`);
    } catch {
      // riferimento non valido: salta le predizioni
    }
  }

  // Carico ATL/CTL/TSB
  if (activities.length > 0) {
    const { atl, ctl, tsb } = computeATLCTL(
      activities.map((a) => ({
        started_at: a.started_at,
        duration_s: a.duration_s,
        rpe: a.rpe,
      })),
    );
    const fresh = tsb > 5 ? "fresco" : tsb < -10 ? "affaticato" : "in equilibrio";
    lines.push(`Carico: ATL ${atl} / CTL ${ctl} → TSB ${tsb} (${fresh}).`);

    // Volume ultime 4 settimane
    const since28 = isoDaysAgo(28);
    const vol = activities
      .filter((a) => a.started_at.slice(0, 10) >= since28)
      .reduce((s, a) => s + a.distance_m, 0);
    lines.push(`Volume medio: ${(vol / 4 / 1000).toFixed(1)} km/sett (ultime 4).`);
  }

  // Passi per tipo
  const paces = pacePerType(activities);
  const paceParts = Object.entries(paces).map(
    ([t, s]) => `${TYPE_LABELS[t as WorkoutType]} ${formatPace(s)}`,
  );
  if (paceParts.length > 0) lines.push(`Passi medi: ${paceParts.join(" · ")}.`);

  // Aderenza 14gg
  if (recentPlanned && recentPlanned.length > 0) {
    const a = computeAdherence(recentPlanned, today);
    lines.push(
      `Aderenza (14gg): ${a.completed}/${a.total} completati, ${a.missed} saltati, ${a.skipped} skippati (${a.pct}%).`,
    );
  }

  // Profilo HR
  if (profile?.max_hr || profile?.resting_hr) {
    lines.push(
      `HR: max ${profile.max_hr ?? "?"} / riposo ${profile.resting_hr ?? "?"} bpm.`,
    );
  }

  // Piano già a calendario (prossimi giorni)
  if (upcomingPlanned && upcomingPlanned.length > 0) {
    lines.push(`Piano già a calendario:`);
    for (const w of upcomingPlanned.slice(0, 14)) {
      lines.push(
        `- ${shortDate(w.date)} ${TYPE_LABELS[w.type]}${
          w.target_distance_m ? ` ${formatDistance(w.target_distance_m)}` : ""
        }${w.description ? ` "${w.description}"` : ""}`,
      );
    }
  }

  // Ultime corse (max 8, più recenti prima)
  const recent = [...activities].reverse().slice(0, 8);
  if (recent.length > 0) {
    lines.push(`Ultime corse:`);
    for (const a of recent) {
      lines.push(
        `- ${shortDate(a.started_at)} ${TYPE_LABELS[a.type]} ${formatDistance(
          a.distance_m,
        )} ${formatPace(a.avg_pace_s_km)}${a.avg_hr ? ` HR${a.avg_hr}` : ""}${
          a.rpe ? ` RPE${a.rpe}` : ""
        }${a.notes ? ` "${a.notes.slice(0, 80)}"` : ""}`,
      );
    }
  } else {
    lines.push(`Nessuna corsa registrata nelle ultime 6 settimane.`);
  }

  return { markdown: lines.join("\n"), activeGoal: goal ?? null };
}

/** Riga di dettaglio compatta di una singola corsa, per la valutazione. */
export function activityDetailLine(a: {
  started_at: string;
  type: WorkoutType;
  distance_m: number;
  duration_s: number;
  avg_pace_s_km: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  rpe: number | null;
  elevation_gain_m: number | null;
  notes: string | null;
}): string {
  const parts = [
    `${TYPE_LABELS[a.type]} ${formatDistance(a.distance_m)}`,
    `durata ${formatDuration(a.duration_s)}`,
    `passo ${formatPace(a.avg_pace_s_km)}`,
  ];
  if (a.avg_hr) parts.push(`HR media ${a.avg_hr}`);
  if (a.max_hr) parts.push(`HR max ${a.max_hr}`);
  if (a.elevation_gain_m) parts.push(`disl +${a.elevation_gain_m}m`);
  if (a.rpe) parts.push(`RPE ${a.rpe}/10`);
  let line = `${shortDate(a.started_at)} — ${parts.join(", ")}.`;
  if (a.notes) line += ` Note atleta: "${a.notes}"`;
  return line;
}

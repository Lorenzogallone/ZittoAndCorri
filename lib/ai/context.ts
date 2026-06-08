// Costruisce il digest compatto dell'atleta da allegare ai prompt. PLAN.md §8.
// Riusa SOLO funzioni deterministiche di lib/metrics: l'LLM legge questi numeri,
// non li produce. Niente stream HR/GPS nel prompt (§3).
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { predictRaces } from "@/lib/metrics/predict";
import { computeATLCTL } from "@/lib/metrics/load";
import { computeAdherence } from "@/lib/metrics/adherence";
import { buildPlanVsActual } from "@/lib/metrics/plan-vs-actual";
import { formatPace, formatDuration, formatDistance } from "@/lib/format";
import type {
  Activity,
  Goal,
  PlannedWorkout,
  Profile,
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

/** Giorni interi trascorsi da `iso` (data o timestamp) a ora. */
function daysAgo(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

/** "N giorni fa" / "ieri" / "oggi". */
function daysAgoLabel(iso: string): string {
  const d = daysAgo(iso);
  if (d <= 0) return "oggi";
  if (d === 1) return "ieri";
  return `${d} giorni fa`;
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
    { data: latestRuns },
    { data: recentPlanned },
    { data: upcomingPlanned },
    { data: lastPlanReview },
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
    // Ultime corse SENZA filtro temporale: garantiscono che il modello veda
    // sempre le corse più recenti, anche dopo lunghi stop (> 6 settimane).
    supabase
      .from("activities")
      .select("started_at, type, distance_m, duration_s, avg_pace_s_km, avg_hr, rpe, notes")
      .eq("user_id", userId)
      .order("started_at", { ascending: false })
      .limit(5)
      .returns<CtxActivity[]>(),
    supabase
      .from("planned_workouts")
      .select("status, date, type, target_distance_m, description")
      .eq("user_id", userId)
      .gte("date", fourteenAgo)
      .lte("date", today)
      .order("date")
      .returns<
        Array<
          Pick<
            PlannedWorkout,
            "status" | "date" | "type" | "target_distance_m" | "description"
          >
        >
      >(),
    supabase
      .from("planned_workouts")
      .select("date, type, target_distance_m, target_pace_s_km, target_duration_s, description")
      .eq("user_id", userId)
      .gt("date", today)
      .order("date")
      .returns<
        Pick<
          PlannedWorkout,
          | "date"
          | "type"
          | "target_distance_m"
          | "target_pace_s_km"
          | "target_duration_s"
          | "description"
        >[]
      >(),
    // Piano precedente: l'ultima review generata, per capire se è un replan.
    supabase
      .from("plan_reviews")
      .select("range_start, range_end, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ range_start: string; range_end: string; created_at: string }>(),
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
      `Aderenza (14gg): ${a.completed}/${a.total} completati, ${a.missed} saltati (${a.pct}%).`,
    );
  }

  // Profilo HR
  if (profile?.max_hr || profile?.resting_hr) {
    lines.push(
      `HR: max ${profile.max_hr ?? "?"} / riposo ${profile.resting_hr ?? "?"} bpm.`,
    );
  }

  // Segnali temporali: distinguono un replan ravvicinato da uno tardivo / dopo
  // un lungo stop. Le ultime corse sono prese senza filtro di finestra.
  const runs = latestRuns ?? [];
  const lastRun = runs[0] ?? null;
  const gap = lastRun ? daysAgo(lastRun.started_at) : null;
  if (lastRun) {
    lines.push(`Ultima corsa: ${daysAgoLabel(lastRun.started_at)}.`);
  } else {
    lines.push(`Nessuna corsa registrata: atleta senza storico.`);
  }
  if (lastPlanReview) {
    lines.push(
      `Ultimo piano generato: ${daysAgoLabel(lastPlanReview.created_at)} (copriva ${shortDate(
        lastPlanReview.range_start,
      )}–${shortDate(lastPlanReview.range_end)}). Questo è un REPLAN.`,
    );
  } else {
    lines.push(`Primo piano: nessun piano precedente registrato.`);
  }
  if (gap != null && gap > 14) {
    lines.push(
      `⚠ Stop prolungato: ~${gap} giorni senza corse — ripartire con prudenza, ridurre volume/intensità.`,
    );
  }

  // Piano attuale a calendario (futuro): le descrizioni dei singoli giorni
  // possono contenere vincoli dell'atleta (es. "questo giorno non posso").
  if (upcomingPlanned && upcomingPlanned.length > 0) {
    lines.push(
      `Piano attuale a calendario (rispetta le note di ogni giorno come vincoli):`,
    );
    for (const w of upcomingPlanned.slice(0, 30)) {
      const detail = [
        w.target_distance_m ? formatDistance(w.target_distance_m) : null,
        w.target_pace_s_km ? formatPace(w.target_pace_s_km) : null,
        w.target_duration_s ? formatDuration(w.target_duration_s) : null,
      ]
        .filter(Boolean)
        .join(" ");
      lines.push(
        `- ${shortDate(w.date)} ${TYPE_LABELS[w.type]}${detail ? ` ${detail}` : ""}${
          w.description ? ` "${w.description}"` : ""
        }`,
      );
    }
  }

  // Ultime 2 settimane — piano vs reale (giorno per giorno). Le corse possono
  // cadere anche in un giorno diverso da quello pianificato.
  const acts14 = activities.filter((a) => a.started_at.slice(0, 10) >= fourteenAgo);
  const pva = buildPlanVsActual(recentPlanned ?? [], acts14);
  if (pva.length > 0) {
    lines.push(`Ultime 2 settimane — piano vs reale:`);
    for (const d of pva) {
      const plan =
        d.planned.length > 0
          ? d.planned
              .map(
                (p) =>
                  `${TYPE_LABELS[p.type]}${p.status === "completed" ? "✓" : ""}`,
              )
              .join(", ")
          : "—";
      const done =
        d.actual.length > 0
          ? d.actual
              .map((a) => `${TYPE_LABELS[a.type]} ${formatDistance(a.distance_m)}`)
              .join(", ")
          : "—";
      lines.push(`- ${shortDate(d.date)}: piano ${plan} | fatto ${done}`);
    }
  }

  // Ultime corse — SEMPRE presenti (anche se più vecchie di 6 settimane).
  if (runs.length > 0) {
    lines.push(`Ultime corse:`);
    for (const a of runs) {
      lines.push(
        `- ${shortDate(a.started_at)} ${TYPE_LABELS[a.type]} ${formatDistance(
          a.distance_m,
        )} ${formatPace(a.avg_pace_s_km)}${a.avg_hr ? ` HR${a.avg_hr}` : ""}${
          a.rpe ? ` RPE${a.rpe}` : ""
        }${a.notes ? ` "${a.notes.slice(0, 80)}"` : ""}`,
      );
    }
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

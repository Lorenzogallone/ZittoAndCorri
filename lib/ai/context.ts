// Costruisce il digest compatto dell'atleta da allegare ai prompt. PLAN.md §8.
// Riusa SOLO funzioni deterministiche di lib/metrics: l'LLM legge questi numeri,
// non li produce. Niente stream HR/GPS nel prompt (§3).
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { predictRaces } from "@/lib/metrics/predict";
import { computeATLCTL } from "@/lib/metrics/load";
import { buildPlanVsActual } from "@/lib/metrics/plan-vs-actual";
import { calibratePaces } from "@/lib/metrics/pace-calibration";
import { zoneForHr } from "@/lib/metrics/zones";
import { formatPace, formatDuration, formatDistance } from "@/lib/format";
import type {
  Activity,
  Goal,
  PlannedWorkout,
  Profile,
  ActivityType,
  WorkoutType,
} from "@/lib/types";
import { TYPE_LABELS, SPORT_LABELS } from "@/lib/activity-meta";

type CtxActivity = Pick<
  Activity,
  | "started_at"
  | "type"
  | "sport"
  | "distance_m"
  | "duration_s"
  | "avg_pace_s_km"
  | "avg_hr"
  | "rpe"
  | "hr_drift_pct"
  | "avg_cadence_spm"
  | "notes"
>;

const CTX_ACTIVITY_SELECT =
  "started_at, type, sport, distance_m, duration_s, avg_pace_s_km, avg_hr, rpe, hr_drift_pct, avg_cadence_spm, notes";

/** Tronca un testo lungo per il prompt senza spezzare a metà parola. */
function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max).replace(/\s+\S*$/, "") + "…";
}

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
    if (a.type === "unclassified") continue;
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
    { data: recentReviews },
    { data: recentEvals },
    { data: snapshot },
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
      .select(CTX_ACTIVITY_SELECT)
      .eq("user_id", userId)
      .gte("started_at", `${since42}T00:00:00`)
      .order("started_at", { ascending: true })
      .returns<CtxActivity[]>(),
    // Ultime corse (solo running) SENZA filtro temporale: garantiscono che il
    // modello veda sempre le corse più recenti, anche dopo lunghi stop.
    supabase
      .from("activities")
      .select(CTX_ACTIVITY_SELECT)
      .eq("user_id", userId)
      .eq("sport", "running")
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
      .select(
        "date, type, target_distance_m, target_pace_s_km, target_duration_s, target_hr_bpm, description, focus",
      )
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
          | "target_hr_bpm"
          | "description"
          | "focus"
        >[]
      >(),
    // Storico piani: le ultime review generate. La più recente serve anche a
    // capire se questo è un replan; le summary danno continuità tra i cicli.
    supabase
      .from("plan_reviews")
      .select("range_start, range_end, summary, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(3)
      .returns<
        Array<{
          range_start: string;
          range_end: string;
          summary: string;
          created_at: string;
        }>
      >(),
    // Ultime valutazioni del coach: per coerenza tra i feedback.
    supabase
      .from("evaluations")
      .select("summary, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(3)
      .returns<Array<{ summary: string | null; created_at: string }>>(),
    // Memoria coach: narrativa di fase aggiornata a ogni generazione piano.
    supabase
      .from("athlete_snapshot")
      .select("narrative, updated_at")
      .eq("user_id", userId)
      .maybeSingle<{ narrative: Record<string, unknown> | null; updated_at: string }>(),
  ]);

  const activities = acts ?? [];
  // Statistiche di corsa (passi, volumi, predizioni) solo dal running; il
  // carico invece usa tutto — vedi sotto.
  const runActivities = activities.filter((a) => (a.sport ?? "running") === "running");
  const otherActivities = activities.filter((a) => (a.sport ?? "running") !== "running");
  const lastPlanReview = recentReviews?.[0] ?? null;
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

  // Memoria coach: fase di allenamento mantenuta dall'LLM piano dopo piano.
  const coachMemory =
    snapshot?.narrative && typeof snapshot.narrative === "object"
      ? (snapshot.narrative as { coach_memory?: unknown }).coach_memory
      : null;
  if (typeof coachMemory === "string" && coachMemory.trim()) {
    lines.push(
      `Fase di allenamento (memoria coach, agg. ${shortDate(snapshot!.updated_at)}): ${clip(coachMemory.trim(), 600)}`,
    );
  }

  // Predizioni Riegel — solo dalle corse.
  const best = bestReference(runActivities);
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

  // Carico ATL/CTL/TSB — su TUTTE le attività (sRPE = durata × RPE vale anche
  // per calcio, bici, palestra…): la fatica non-corsa conta.
  if (activities.length > 0) {
    const { atl, ctl, tsb } = computeATLCTL(
      activities.map((a) => ({
        started_at: a.started_at,
        duration_s: a.duration_s,
        rpe: a.rpe,
      })),
    );
    const fresh = tsb > 5 ? "fresco" : tsb < -10 ? "affaticato" : "in equilibrio";
    lines.push(
      `Carico: ATL ${atl} / CTL ${ctl} → TSB ${tsb} (${fresh}).${
        otherActivities.length > 0
          ? " Include anche le attività non di corsa."
          : ""
      }`,
    );

    // Volume ultime 4 settimane — solo corsa.
    const since28 = isoDaysAgo(28);
    const vol = runActivities
      .filter((a) => a.started_at.slice(0, 10) >= since28)
      .reduce((s, a) => s + a.distance_m, 0);
    lines.push(`Volume medio: ${(vol / 4 / 1000).toFixed(1)} km/sett di corsa (ultime 4).`);
  }

  // Passi per tipo — solo corsa.
  const paces = pacePerType(runActivities);
  const paceParts = Object.entries(paces).map(
    ([t, s]) => `${TYPE_LABELS[t as WorkoutType]} ${formatPace(s)}`,
  );
  if (paceParts.length > 0) lines.push(`Passi medi: ${paceParts.join(" · ")}.`);

  // Calibrazione ritmi ↔ HR (deterministico): dice se i ritmi correnti sono
  // davvero nella zona attesa per il tipo. Segnale chiave: se le easy escono
  // in Z3/Z4, per l'atleta quel passo OGGI non è easy e i target del piano
  // vanno adeguati.
  const hrConfig = {
    max_hr: profile?.max_hr ?? null,
    resting_hr: profile?.resting_hr ?? null,
  };
  const calibration = calibratePaces(runActivities, hrConfig);
  if (calibration) {
    lines.push(`Calibrazione ritmi ↔ HR (ultime 6 sett):`);
    for (const c of calibration) {
      const drift =
        c.avg_drift_pct != null && Math.abs(c.avg_drift_pct) >= 3
          ? `, deriva HR ${c.avg_drift_pct > 0 ? "+" : ""}${c.avg_drift_pct}%`
          : "";
      const verdict = c.too_hard
        ? ` ⚠ sopra la zona attesa (${c.expected_zone.toUpperCase()}): a questo ritmo l'atleta oggi fatica più del dovuto — proponi target più conservativi finché la HR non rientra`
        : ` ok, in zona attesa`;
      lines.push(
        `- ${TYPE_LABELS[c.type]}: ${formatPace(c.avg_pace_s_km)} a HR ~${c.avg_hr} (${c.zone.toUpperCase()}${drift}) su ${c.runs} corse →${verdict}.`,
      );
    }
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
        w.target_hr_bpm ? `HR≤${w.target_hr_bpm}` : null,
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

  // Ultime 2 settimane — piano vs reale (giorno per giorno), incluse le
  // attività non di corsa: spiegano i giorni in cui la corsa è saltata
  // (es. "piano Easy | fatto Calcio 1:30").
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
                  TYPE_LABELS[p.type],
              )
              .join(", ")
          : "—";
      const done =
        d.actual.length > 0
          ? d.actual
              .map((a) =>
                (a.sport ?? "running") === "running"
                  ? `${TYPE_LABELS[a.type]} ${formatDistance(a.distance_m)}`
                  : `${SPORT_LABELS[a.sport ?? "other"]} ${formatDuration(a.duration_s)}`,
              )
              .join(", ")
          : "—";
      lines.push(`- ${shortDate(d.date)}: piano ${plan} | fatto ${done}`);
    }
  }

  // Altre attività (non corsa, ultimi 28gg): fanno parte del carico e
  // spiegano stanchezza o allenamenti saltati.
  const since28d = isoDaysAgo(28);
  const others28 = otherActivities
    .filter((a) => a.started_at.slice(0, 10) >= since28d)
    .slice(-8);
  if (others28.length > 0) {
    lines.push(`Altre attività (non corsa, ultimi 28gg):`);
    for (const a of others28) {
      lines.push(
        `- ${shortDate(a.started_at)} ${SPORT_LABELS[a.sport ?? "other"]} ${formatDuration(
          a.duration_s,
        )}${a.distance_m > 0 ? ` ${formatDistance(a.distance_m)}` : ""}${
          a.avg_hr ? ` HR${a.avg_hr}` : ""
        }${a.rpe ? ` RPE${a.rpe}` : ""}${a.notes ? ` "${clip(a.notes, 60)}"` : ""}`,
      );
    }
  }

  // Ultime corse — SEMPRE presenti (anche se più vecchie di 6 settimane).
  // Con zona della HR media, deriva cardiaca e cadenza quando disponibili:
  // sono i segnali che permettono al coach di giudicare lo sforzo reale.
  if (runs.length > 0) {
    lines.push(`Ultime corse:`);
    for (const a of runs) {
      const zone = a.avg_hr ? zoneForHr(a.avg_hr, hrConfig) : null;
      const drift =
        a.hr_drift_pct != null && Math.abs(a.hr_drift_pct) >= 3
          ? ` deriva${a.hr_drift_pct > 0 ? "+" : ""}${a.hr_drift_pct}%`
          : "";
      const cadence = a.avg_cadence_spm ? ` cad${a.avg_cadence_spm}` : "";
      lines.push(
        `- ${shortDate(a.started_at)} ${TYPE_LABELS[a.type]} ${formatDistance(
          a.distance_m,
        )} ${formatPace(a.avg_pace_s_km)}${
          a.avg_hr ? ` HR${a.avg_hr}${zone ? ` (${zone.toUpperCase()})` : ""}` : ""
        }${drift}${cadence}${a.rpe ? ` RPE${a.rpe}` : ""}${
          a.notes ? ` "${a.notes.slice(0, 80)}"` : ""
        }`,
      );
    }
  }

  // Storico piani recenti: le review dei cicli precedenti danno continuità
  // alla progressione (cosa si è lavorato e perché).
  if (recentReviews && recentReviews.length > 0) {
    lines.push(`Storico piani recenti (dal più recente):`);
    for (const r of recentReviews) {
      lines.push(
        `- ${shortDate(r.range_start)}–${shortDate(r.range_end)}: ${clip(r.summary, 280)}`,
      );
    }
  }

  // Valutazioni recenti del coach: per coerenza coi feedback già dati.
  const evals = (recentEvals ?? []).filter(
    (e): e is { summary: string; created_at: string } =>
      typeof e.summary === "string" && e.summary.trim() !== "",
  );
  if (evals.length > 0) {
    lines.push(`Tue valutazioni recenti (dal più recente):`);
    for (const e of evals) {
      lines.push(`- ${shortDate(e.created_at)}: ${clip(e.summary, 200)}`);
    }
  }

  return { markdown: lines.join("\n"), activeGoal: goal ?? null };
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
    ? TYPE_LABELS[a.type]
    : `${SPORT_LABELS[a.sport ?? "other"]} (non corsa)`;
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

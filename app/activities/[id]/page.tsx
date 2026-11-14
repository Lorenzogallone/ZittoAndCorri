import { after } from "next/server";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { timeInZoneFromSeries } from "@/lib/metrics/zones";
import { computeSplits } from "@/lib/metrics/splits";
import { computeHrDrift } from "@/lib/metrics/effort";
import { bestMovingTime, movingTimeFromStreams } from "@/lib/metrics/pauses";
import { avgPace } from "@/lib/metrics/pace";
import { bestEffortsForActivity, personalRecords } from "@/lib/metrics/best-efforts";
import { cadencePoints, computeIntervals, intervalsUpToDate, paceCheckFor, persistDerived, persistIntervals } from "@/lib/derived";
import { getEffectiveHrConfig } from "@/lib/zepp/effective-hr";
import { getAiStatus } from "@/lib/ai/ai-status";
import type { Activity, ActivityStream, Evaluation, Profile, TimeInZone } from "@/lib/types";
import { ActivityView } from "./activity-view";

/** Downsample a series to at most maxPoints by skipping evenly. */
function downsample<T>(arr: T[], maxPoints = 300): T[] {
  if (arr.length <= maxPoints) return arr;
  const step = Math.ceil(arr.length / maxPoints);
  return arr.filter((_, i) => i % step === 0);
}

// La server action `evaluateActivity` (Coach AI) gira come parte di questa
// route: tempo extra per la chiamata a Gemini così la funzione non viene
// killata dalla piattaforma (causa del "crash"/reload in PWA). Vedi DEADLINE_MS
// in lib/ai/gemini.ts.
export const maxDuration = 240;

export default async function ActivityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: stored }, { data: streams }, { data: profile }, { data: evaluation }, { data: evaluationJob }, aiStatus] =
    await Promise.all([
      supabase
        .from("activities")
        .select("*")
        .eq("id", id)
        .maybeSingle<Activity>(),
      // "*": distanza e lap dell'orologio arrivano con la migration 0022.
      supabase
        .from("activity_streams")
        .select("*")
        .eq("activity_id", id)
        .maybeSingle<ActivityStream>(),
      supabase
        .from("profiles")
        .select("max_hr, resting_hr")
        .eq("id", user.id)
        .maybeSingle<Pick<Profile, "max_hr" | "resting_hr">>(),
      // "*": il costo dell'analisi (ai_usage) arriva con la migrazione 0024.
      supabase
        .from("evaluations")
        .select("*")
        .eq("activity_id", id)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<Evaluation>(),
      supabase
        .from("ai_jobs")
        .select("status, error")
        .eq("user_id", user.id)
        .eq("kind", "evaluation")
        .eq("ref_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ status: "pending" | "done" | "error"; error: string | null }>(),
      getAiStatus(supabase, user.id),
    ]);

  if (!stored) notFound();

  // Tempo in movimento: se il file non lo dice (o conta ancora le pause) si
  // ricava dalle pause negli stream, si mostra subito e si salva con il passo.
  const fromPauses = streams
    ? movingTimeFromStreams(stored.duration_s, { distance: streams.distance_series, gps: streams.gps_series })
    : null;
  const best = bestMovingTime(stored.duration_s, stored.moving_time_s, fromPauses);
  const derivedMoving = best != null && best !== stored.moving_time_s ? best : null;
  const activity: Activity = derivedMoving != null
    ? { ...stored, moving_time_s: derivedMoving, avg_pace_s_km: stored.distance_m > 0 ? avgPace(stored.distance_m, derivedMoving) : stored.avg_pace_s_km }
    : stored;
  if (derivedMoving != null) {
    const userId = user.id;
    after(async () => {
      const { error } = await createAdminClient()
        .from("activities")
        .update({ moving_time_s: activity.moving_time_s, avg_pace_s_km: activity.avg_pace_s_km })
        .eq("id", activity.id)
        .eq("user_id", userId);
      if (error) console.error("moving time refresh:", error.message);
    });
  }

  // Verifica del passo calcolata sul momento (il piano può essere cambiato) e
  // record personali: se il dato salvato è assente o superato, lo aggiorniamo
  // in background.
  const [paceResult, { data: runEfforts }] = await Promise.all([
    paceCheckFor(supabase, user.id, activity, streams?.gps_series ?? null),
    activity.sport === "running"
      ? supabase
          .from("activities")
          .select("id, started_at, best_efforts")
          .eq("user_id", user.id)
          .eq("sport", "running")
          .not("best_efforts", "is", null)
          .returns<Array<Pick<Activity, "id" | "started_at" | "best_efforts">>>()
      : Promise.resolve({ data: [] as Array<Pick<Activity, "id" | "started_at" | "best_efforts">> }),
  ]);
  const heldRecords = personalRecords(runEfforts ?? []).filter((record) => record.activity_id === activity.id);
  if (
    activity.sport === "running" &&
    (activity.best_efforts == null ||
      JSON.stringify(activity.pace_check ?? null) !== JSON.stringify(paceResult?.check ?? null) ||
      // Algoritmo cambiato (es. pause escluse): i best effort salvati sono superati.
      JSON.stringify(activity.best_efforts) !== JSON.stringify(bestEffortsForActivity({ ...activity, gps: streams?.gps_series ?? null })))
  ) {
    const userId = user.id;
    const gps = streams?.gps_series ?? null;
    after(() => persistDerived(createAdminClient(), userId, activity, gps));
  }

  // Ripetute: l'analisi salvata se è aggiornata, altrimenti si calcola ora (corse
  // importate prima, algoritmo cambiato) e si salva in background.
  let intervals = intervalsUpToDate(activity.intervals) ? activity.intervals! : null;
  if (!intervals && activity.sport === "running") {
    const declared = activity.intervals?.declared ?? null;
    intervals = await computeIntervals(supabase, user.id, activity, {
      gps: streams?.gps_series,
      hr: streams?.hr_series,
      distance: streams?.distance_series,
      laps: streams?.laps,
      cadence: cadencePoints(streams?.cadence),
    }, declared);
    if ("intervals" in activity) {
      const userId = user.id;
      after(() => persistIntervals(createAdminClient(), userId, activity, undefined, declared));
    }
  }

  const profileCtx = await getEffectiveHrConfig(supabase, user.id, profile ?? null);

  // Zone HR: dalla serie reale se c'è (più precisa), altrimenti quelle salvate.
  const zones: TimeInZone | null =
    streams?.hr_series && streams.hr_series.length >= 2
      ? timeInZoneFromSeries(streams.hr_series, profileCtx)
      : activity.time_in_zone;
  // Split sempre dagli stream quando ci sono: così le corse importate prima
  // valgono con l'algoritmo attuale (pause escluse). Se cambiano si salvano.
  const freshSplits = streams?.gps_series && streams.gps_series.length >= 2
    ? computeSplits(streams.gps_series, streams.hr_series ?? undefined)
    : null;
  const splits = freshSplits ?? activity.splits;
  if (freshSplits && JSON.stringify(freshSplits) !== JSON.stringify(activity.splits ?? null)) {
    const userId = user.id;
    const drift = computeHrDrift(streams?.hr_series ?? undefined, streams?.gps_series ?? undefined);
    after(async () => {
      const { error } = await createAdminClient()
        .from("activities")
        .update({ splits: freshSplits, ...(drift != null ? { hr_drift_pct: drift } : {}) })
        .eq("id", activity.id)
        .eq("user_id", userId);
      if (error) console.error("splits refresh:", error.message);
    });
  }
  // Serie ridotte per il client: migliaia di punti nel payload RSC rendono
  // lentissima la navigazione su rete mobile.
  const gps = streams?.gps_series && streams.gps_series.length >= 2 ? downsample(streams.gps_series, 500) : null;

  return (
    <ActivityView
      activity={activity}
      gps={gps}
      hr={streams?.hr_series ? downsample(streams.hr_series, 300) : null}
      elevation={streams?.gps_series?.some((p) => p.ele != null) ? downsample(streams.gps_series, 300) : null}
      splits={splits}
      zones={zones}
      records={heldRecords}
      pace={paceResult ? { check: paceResult.check, workoutId: paceResult.workout.id } : null}
      intervals={intervals}
      evaluation={evaluation ?? null}
      evaluationJob={evaluationJob ?? null}
      keyConfigured={aiStatus.analysis.active !== null}
    />
  );
}

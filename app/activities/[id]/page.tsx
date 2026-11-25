import { after } from "next/server";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { timeInZoneFromSeries } from "@/lib/metrics/zones";
import { computeSplits } from "@/lib/metrics/splits";
import { computeHrDrift } from "@/lib/metrics/effort";
import { bestMovingTime, detectPauses, movingClock, movingTimeFromStreams, referenceTrack, withoutPauses } from "@/lib/metrics/pauses";
import { segmentSpans } from "@/lib/metrics/segment-times";
import { paceSeries } from "@/lib/metrics/pace-series";
import { avgPace } from "@/lib/metrics/pace";
import { bestEffortsForActivity, personalRecords } from "@/lib/metrics/best-efforts";
import { cadencePoints, computeIntervals, intervalsUpToDate, paceCheckFor, persistDerived, persistIntervals } from "@/lib/derived";
import { getEffectiveHrConfig } from "@/lib/zepp/effective-hr";
import { getAiStatus } from "@/lib/ai/ai-status";
import { effectiveAiJob } from "@/lib/ai/job-staleness";
import type { Activity, ActivityStream, Evaluation, Profile, TimeInZone } from "@/lib/types";
import { hasIntervals, withCoachVerdict } from "@/lib/intervals-text";
import { kmSplits } from "@/lib/metrics/km-splits";
import { ActivityView } from "./activity-view";

/** Downsample a series to at most maxPoints by skipping evenly. */
function downsample<T>(arr: T[], maxPoints = 300): T[] {
  if (arr.length <= maxPoints) return arr;
  const step = Math.ceil(arr.length / maxPoints);
  return arr.filter((_, i) => i % step === 0);
}

// The `evaluateActivity` server action (AI Coach) runs as part of this
// route: extra time for the Gemini call so the function isn't
// killed by the platform (cause of the "crash"/reload in the PWA). See DEADLINE_MS
// in lib/ai/gemini.ts.
export const maxDuration = 240;

export default async function ActivityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const t = await getTranslations("activities.detail");
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
      // "*": the watch's distance and laps come with migration 0022.
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
      // "*": the analysis cost (ai_usage) comes with migration 0024.
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
        .select("status, error, created_at")
        .eq("user_id", user.id)
        .eq("kind", "evaluation")
        .eq("ref_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ status: "pending" | "done" | "error"; error: string | null; created_at: string | null }>(),
      getAiStatus(supabase, user.id),
    ]);

  if (!stored) notFound();

  // Moving time: if the file doesn't say (or still counts the pauses) it is
  // derived from the pauses in the streams, shown right away and saved with the pace.
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

  // Pace check computed on the spot (the plan may have changed) and
  // personal records: if the saved data is missing or outdated, we update it
  // in the background.
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
      // Algorithm changed (e.g. pauses excluded): the saved best efforts are outdated.
      JSON.stringify(activity.best_efforts) !== JSON.stringify(bestEffortsForActivity({ ...activity, gps: streams?.gps_series ?? null })))
  ) {
    const userId = user.id;
    const gps = streams?.gps_series ?? null;
    after(() => persistDerived(createAdminClient(), userId, activity, gps));
  }

  // Repeats: the saved analysis if up to date, otherwise computed now (runs
  // imported earlier, algorithm changed) and saved in the background.
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

  // The coach's comment has the last word on the automatically found repeats.
  intervals = withCoachVerdict(intervals, evaluation?.flags);

  const profileCtx = await getEffectiveHrConfig(supabase, user.id, profile ?? null);

  // HR zones: from the real series if present (more precise), otherwise the saved ones.
  const zones: TimeInZone | null =
    streams?.hr_series && streams.hr_series.length >= 2
      ? timeInZoneFromSeries(streams.hr_series, profileCtx)
      : activity.time_in_zone;
  // Splits always from the streams when available: this way runs imported earlier
  // are valid with the current algorithm (pauses excluded). If they change they are saved.
  const freshSplits = streams?.gps_series && streams.gps_series.length >= 2
    ? computeSplits(streams.gps_series, streams.hr_series ?? undefined)
    : null;
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
  // Reduced series for the client: thousands of points in the RSC payload make
  // navigation on mobile networks very slow.
  const gps = streams?.gps_series && streams.gps_series.length >= 2 ? downsample(streams.gps_series, 500) : null;
  // Charts on moving time: the watch's pauses don't draw flat stretches.
  const moving = streams
    ? withoutPauses({ gps: streams.gps_series, hr: streams.hr_series, distance: streams.distance_series, cadence: cadencePoints(streams.cadence) })
    : null;
  const movingTrack = moving ? referenceTrack(moving) : null;
  const pace = activity.sport === "running" && movingTrack ? paceSeries(movingTrack) : [];
  const cadence = activity.sport === "running"
    ? (moving?.cadence ?? []).filter((p) => p.rpm > 0).map((p) => ({ t: p.t, v: p.rpm * 2 }))
    : [];
  // Repeat segments on both watches: real for the map, moving for the chart.
  const rawTrack = streams ? referenceTrack({ distance: streams.distance_series, gps: streams.gps_series }) : null;
  // Continuous run (long, easy): km by km instead of repeats.
  const km = activity.sport === "running" && streams && !hasIntervals(intervals)
    ? kmSplits({ gps: streams.gps_series, hr: streams.hr_series, distance: streams.distance_series, cadence: cadencePoints(streams.cadence) })
    : null;
  const segments = hasIntervals(intervals)
    ? segmentSpans(intervals.segments, movingClock(rawTrack ? detectPauses(rawTrack) : []))
    : (km?.splits ?? []).map((split, index) => ({
        index, kind: "km", variant: null, label: t("kmSegment", { km: split.km }),
        start: split.start, end: split.end, movingStart: split.movingStart, movingEnd: split.movingEnd,
      }));

  return (
    <ActivityView
      activity={activity}
      gps={gps}
      hr={moving?.hr ? downsample(moving.hr, 300) : null}
      elevation={moving?.gps?.some((p) => p.ele != null) ? downsample(moving.gps, 300) : null}
      paceSeries={pace.length >= 2 ? downsample(pace, 400) : null}
      cadence={cadence.length >= 2 ? downsample(cadence, 300) : null}
      zones={zones}
      records={heldRecords}
      pace={paceResult ? { check: paceResult.check, workoutId: paceResult.workout.id } : null}
      intervals={intervals}
      km={km}
      segments={segments}
      evaluation={evaluation ?? null}
      // A pending job past the maximum time has expired: error and "Retry".
      evaluationJob={evaluationJob ? effectiveAiJob(evaluationJob) : null}
      keyConfigured={aiStatus.analysis.active !== null}
    />
  );
}

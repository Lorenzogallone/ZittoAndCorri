import { after } from "next/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeATLCTL } from "@/lib/metrics/load";
import { personalRecords } from "@/lib/metrics/best-efforts";
import { predictionReference } from "@/lib/metrics/race-prediction";
import { weeklyVolume } from "@/lib/plan/weekly";
import { addDays, daysBetween, mondayOf, romeDay } from "@/lib/local-date";
import { backfillDerived } from "@/lib/derived";
import { getZeppDashboard } from "@/lib/zepp/data";
import { getEffectiveHrConfig } from "@/lib/zepp/effective-hr";
import type { Goal, Activity, Profile, PlannedWorkout } from "@/lib/types";
import { activeDuration } from "@/lib/format";
import { ProfileView } from "./profile-view";

type ProfileActivity = Pick<
  Activity,
  "id" | "started_at" | "duration_s" | "moving_time_s" | "rpe" | "avg_hr" | "time_in_zone" | "sport" | "distance_m" | "best_efforts" | "pace_check"
>;

const WEEKS_BACK = 11;
const BASE_COLUMNS = "id, started_at, duration_s, moving_time_s, rpe, avg_hr, time_in_zone, sport, distance_m";

/** Senza la migrazione 0018 (record e verifica del passo) il profilo resta leggibile. */
async function profileActivities(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const query = (columns: string) => supabase
    .from("activities")
    .select(columns)
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .returns<ProfileActivity[]>();
  const result = await query(`${BASE_COLUMNS}, best_efforts, pace_check`);
  if (result.error?.code !== "42703") return result;
  const fallback = await query(BASE_COLUMNS);
  return { ...fallback, data: fallback.data?.map((activity) => ({ ...activity, best_efforts: null, pace_check: null })) ?? null };
}

function formTrend(series: Array<{ date: string; ctl: number }>): string | null {
  if (series.length < 42) return null;
  const now = series[series.length - 1].ctl;
  const before = series[series.length - 29].ctl;
  if (before <= 0) return null;
  const change = (now - before) / before;
  if (change > 0.05) return "La forma è in crescita rispetto a un mese fa.";
  if (change < -0.05) return "La forma è in calo rispetto a un mese fa.";
  return "La forma è stabile rispetto a un mese fa.";
}

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const today = romeDay();
  const firstMonday = addDays(mondayOf(today), -WEEKS_BACK * 7);
  const lastSunday = addDays(mondayOf(today), 13);
  const [{ data: activeGoal }, { data: profile }, { data: activities }, { data: planned }] = await Promise.all([
    supabase
      .from("goals")
      .select("race_name, race_date, distance_m, target_time_s")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle<Pick<Goal, "race_name" | "race_date" | "distance_m" | "target_time_s">>(),
    supabase.from("profiles").select("max_hr, resting_hr").eq("id", user.id).maybeSingle<Pick<Profile, "max_hr" | "resting_hr">>(),
    profileActivities(supabase, user.id),
    supabase
      .from("planned_workouts")
      .select("date, type, status, target_distance_m, target_duration_s, target_pace_s_km, workout_steps")
      .eq("user_id", user.id)
      .gte("date", firstMonday)
      .lte("date", lastSunday)
      .returns<Array<Pick<PlannedWorkout, "date" | "type" | "status" | "target_distance_m" | "target_duration_s" | "target_pace_s_km" | "workout_steps">>>(),
  ]);

  const list = activities ?? [];
  const effectiveHr = await getEffectiveHrConfig(supabase, user.id, profile ?? null);
  const load = computeATLCTL(
    list.map((activity) => ({
      started_at: activity.started_at,
      duration_s: activeDuration(activity),
      rpe: activity.rpe,
      avg_hr: activity.avg_hr,
      time_in_zone: activity.time_in_zone,
      sport: activity.sport,
    })),
    undefined,
    effectiveHr,
  );
  const zepp = await getZeppDashboard(supabase, user.id, load);

  // Le corse importate prima dei record vengono completate in background.
  if (list.some((activity) => activity.sport === "running" && activity.best_efforts == null)) {
    const userId = user.id;
    after(() => backfillDerived(createAdminClient(), userId));
  }

  // Un punto a settimana (fino a oggi): linee leggibili invece del dente di sega giornaliero.
  const recentLoad = load.series.slice(-85);
  const formPoints = recentLoad
    .filter((_, index) => (recentLoad.length - 1 - index) % 7 === 0)
    .map((point) => ({ date: point.date, form: point.ctl, fatigue: point.atl }));
  const weeks = weeklyVolume(list, planned ?? [], firstMonday, WEEKS_BACK + 2);
  const records = personalRecords(list);
  const reference = predictionReference(
    list
      .filter((activity) => daysBetween(romeDay(activity.started_at), today) <= 120)
      .map((activity) => ({ ...activity, active_s: activeDuration(activity) })),
  );
  const paceSessions = list
    .filter((activity) => activity.pace_check?.status)
    .slice(0, 5)
    .map((activity) => ({ id: activity.id, started_at: activity.started_at, check: activity.pace_check! }));

  const authName = typeof user.user_metadata?.full_name === "string"
    ? user.user_metadata.full_name
    : typeof user.user_metadata?.name === "string"
      ? user.user_metadata.name
      : null;
  const displayName = authName || user.email?.split("@")[0] || "Runner";
  const initials = displayName.split(" ").map((word: string) => word[0]).join("").toUpperCase().slice(0, 2);
  const daysToRace = activeGoal?.race_date ? daysBetween(today, activeGoal.race_date) : null;

  return (
    <ProfileView
      displayName={displayName}
      initials={initials}
      goal={activeGoal ?? null}
      daysToRace={daysToRace}
      load={load}
      zepp={{ latest: zepp.latest, readiness: zepp.readiness, stale: zepp.stale }}
      hasData={list.length > 0 || zepp.latest != null}
      formPoints={formPoints}
      formTrend={formTrend(load.series)}
      weeks={weeks}
      currentWeek={mondayOf(today)}
      reference={reference}
      records={records}
      paceSessions={paceSessions}
    />
  );
}

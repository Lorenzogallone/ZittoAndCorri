// Daily cron: reminder for tomorrow's session (Rome time) and the day's second
// Intervals.icu sync (the first is /api/cron/intervals in the morning): on
// Vercel Hobby each cron runs at most once a day.
// It also sends the "stale data" alerts (lib/push/sync-alerts): this cron runs
// once a day, so at most one alert a day per problem.
// The status stays 200 even with per-user errors: the outcome is in `ok` and
// in the body. Notifications follow each user's saved language.
// Auth: Authorization: Bearer ${CRON_SECRET} (see vercel.json).

import { createAdminClient } from "@/lib/supabase/admin";
import { cronAuthError } from "@/lib/push/cron-auth";
import { isPushConfigured, sendPushToUser } from "@/lib/push/send";
import { reminderBody } from "@/lib/push/messages";
import { romeDate, shiftIsoDate } from "@/lib/push/weekly-stats";
import { typeLabel } from "@/lib/activity-meta";
import { staticTranslator } from "@/lib/static-translator";
import { loadUserLocales } from "@/lib/push/user-locale";
import type { PlannedWorkout } from "@/lib/types";
import { syncAllIntervalsUsers } from "@/lib/intervals/sync";
import { sendSyncAlerts } from "@/lib/push/sync-alerts";
import { matchPlan, matchWindow, withinWindow, type PlanMatchActivity, type PlanMatchWorkout } from "@/lib/plan/match-activities";

export const maxDuration = 300;

type ReminderWorkout = Pick<
  PlannedWorkout,
  "id" | "user_id" | "type" | "target_distance_m" | "target_duration_s" | "target_pace_s_km" | "workout_steps"
>;

type MatchRow = PlanMatchWorkout & { user_id: string };
type ActivityRow = PlanMatchActivity & { user_id: string };

/** Sessions on `date` already matched to an earlier run. */
async function workoutsDoneEarly(admin: ReturnType<typeof createAdminClient>, date: string, userIds: string[]): Promise<Set<string>> {
  const done = new Set<string>();
  if (!userIds.length) return done;
  try {
    const range = matchWindow(date);
    const [plan, runs] = await Promise.all([
      admin
        .from("planned_workouts")
        .select("id, user_id, date, type, status, target_distance_m, target_duration_s, target_pace_s_km, workout_steps, day_order, day_part")
        .in("user_id", userIds)
        .gte("date", range.from)
        .lte("date", range.to)
        .returns<MatchRow[]>(),
      admin
        .from("activities")
        .select("id, user_id, started_at, sport, type, distance_m, duration_s, moving_time_s")
        .in("user_id", userIds)
        .is("excluded_at", null)
        .gte("started_at", `${shiftIsoDate(range.from, -1)}T12:00:00Z`)
        .lte("started_at", `${shiftIsoDate(range.to, 1)}T12:00:00Z`)
        .returns<ActivityRow[]>(),
    ]);
    if (plan.error || runs.error) throw plan.error ?? runs.error;
    for (const userId of userIds) {
      const workouts = (plan.data ?? []).filter((row) => row.user_id === userId);
      const activities = withinWindow((runs.data ?? []).filter((row) => row.user_id === userId), range);
      const matched = matchPlan(workouts, activities);
      for (const workout of workouts) if (workout.date === date && matched.has(workout.id)) done.add(workout.id);
    }
  } catch (error) {
    console.error("cron daily, sessions already done:", error instanceof Error ? error.message : error);
  }
  return done;
}

export async function GET(request: Request) {
  const authError = cronAuthError(request);
  if (authError) return authError;

  const intervals = await syncAllIntervalsUsers().catch((error) => {
    console.error("cron daily intervals:", error instanceof Error ? error.message : error);
    return { ok: false, error: "Intervals.icu sync failed" };
  });

  // Coach memories expired more than 30 days ago: the coach no longer reads
  // them, they stay visible in settings for a month and are then deleted.
  const admin = createAdminClient();
  const { count: prunedMemories, error: pruneError } = await admin
    .from("coach_memories")
    .delete({ count: "exact" })
    .lt("valid_until", shiftIsoDate(romeDate(), -30));
  if (pruneError) console.error("cron daily memories:", pruneError.message);

  const date = shiftIsoDate(romeDate(), 1);
  const baseOk = intervals.ok && !pruneError;
  if (!isPushConfigured()) {
    return Response.json({ ok: baseOk, date, intervals, prunedMemories, skipped: "push not configured" });
  }

  const [subsRes, workoutsRes] = await Promise.all([
    admin.from("push_subscriptions").select("user_id").returns<Array<{ user_id: string }>>(),
    admin
      .from("planned_workouts")
      .select("id, user_id, type, target_distance_m, target_duration_s, target_pace_s_km, workout_steps")
      .eq("status", "planned")
      .eq("date", date)
      .order("created_at")
      .returns<ReminderWorkout[]>(),
  ]);
  const queryError = subsRes.error ?? workoutsRes.error;
  if (queryError) {
    console.error("cron daily:", queryError.message);
    return Response.json({ ok: false, error: "Query failed.", intervals }, { status: 500 });
  }

  const subscribed = new Set((subsRes.data ?? []).map((row) => row.user_id));
  // Tomorrow's session already done early (a run today or yesterday counts
  // for it): no reminder. If the check fails, the reminder is sent.
  const doneEarly = await workoutsDoneEarly(admin, date, [...new Set((workoutsRes.data ?? []).map((w) => w.user_id))].filter((id) => subscribed.has(id)));
  const byUser = new Map<string, ReminderWorkout[]>();
  for (const workout of workoutsRes.data ?? []) {
    if (!subscribed.has(workout.user_id) || doneEarly.has(workout.id)) continue;
    byUser.set(workout.user_id, [...(byUser.get(workout.user_id) ?? []), workout]);
  }

  const locales = await loadUserLocales(admin, [...byUser.keys()]);
  let notified = 0;
  let delivered = 0;
  for (const [userId, workouts] of byUser) {
    const [first] = workouts;
    const locale = locales.get(userId) ?? "it";
    const [t, labelsT] = await Promise.all([staticTranslator(locale, "push"), staticTranslator(locale, "labels")]);
    const labels = [...new Set(workouts.map((w) => typeLabel(labelsT, w.type)))].join(" + ");
    const sent = await sendPushToUser(userId, {
      title: t("reminder.title", { types: labels }),
      body: reminderBody(first, t, locale),
      url: workouts.length > 1 ? `/plan/day/${date}` : `/plan/${first.id}`,
      tag: `reminder-${date}`,
    });
    if (sent) notified += 1;
    delivered += sent;
  }

  // After the sync just done: the state read is the updated one.
  const syncAlerts = await sendSyncAlerts(admin, [...subscribed], romeDate());

  return Response.json({
    ok: baseOk && syncAlerts.failed === 0,
    date,
    users: byUser.size,
    notified,
    delivered,
    intervals,
    syncAlerts,
    prunedMemories,
  });
}

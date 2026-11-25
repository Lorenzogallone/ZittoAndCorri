import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { intlLocale, type Locale } from "@/i18n/config";
import { AppShell } from "@/components/app-shell";
import { CoachChat } from "@/components/coach-chat";
import { TodayCard } from "@/components/home/today-card";
import { GettingStarted } from "@/components/home/getting-started";
import { GoalCard, UpcomingCard } from "@/components/home/desktop-cards";
import { SyncHealthBanner } from "@/components/home/sync-health-banner";
import { loadSyncIssues } from "@/lib/sync-health-data";
import { trainingPhases } from "@/lib/plan/phases";
import { addDays, daysBetween, mondayOf, romeDay, romeHour } from "@/lib/local-date";
import { buildDays } from "@/lib/plan/day-status";
import { heatForDates } from "@/lib/weather";
import { getAiStatus } from "@/lib/ai/ai-status";
import { staleAiJobCutoff } from "@/lib/ai/job-staleness";
import type { Activity, CoachMessage, Goal, PlanProposal, PlannedWorkout } from "@/lib/types";
import { scheduleIntervalsImportIfStale } from "@/lib/intervals/sync";
import { sortByDayOrder } from "@/lib/plan/day-sessions";
import { matchPlan, matchWindow, withinWindow } from "@/lib/plan/match-activities";
import { withFailureMarks } from "@/lib/coach-failures";
import { withProposalExpiry } from "@/lib/plan/proposal-expiry";
import { workoutStepsOrLegacy } from "@/lib/workout-steps";

// 300 s: the coach chat with slow models (e.g. Opus) uses up to 270 s
// (COACH_BUDGET_MS in app/coach/actions.ts) plus saving.
export const maxDuration = 300;

/** Greeting key based on the current time in Rome. */
function greetingKey(): "morning" | "afternoon" | "evening" {
  const hour = romeHour(new Date().toISOString()) ?? 12;
  if (hour >= 5 && hour < 13) return "morning";
  if (hour >= 13 && hour < 18) return "afternoon";
  return "evening";
}

/** "Wednesday 22 October". */
function longDate(iso: string, locale: Locale): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(intlLocale(locale), { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

/** Steps of "Start here": counts only (head), no rows read.
    *  An error (e.g. Intervals table not yet migrated) counts as "to do". */
async function firstRunSteps(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const count = { count: "exact", head: true } as const;
  const [activities, intervals, zepp, planned] = await Promise.all([
    supabase.from("activities").select("id", count).eq("user_id", userId),
    supabase.from("user_intervals_credentials").select("user_id", count).eq("user_id", userId),
    supabase.from("zepp_connections").select("id", count).eq("user_id", userId).eq("client_kind", "health").eq("enabled", true),
    supabase.from("planned_workouts").select("id", count).eq("user_id", userId),
  ]);
  const some = (result: { error: unknown; count: number | null }) => !result.error && (result.count ?? 0) > 0;
  return { hasActivity: some(activities), watchLinked: some(intervals) || some(zepp), hasPlan: some(planned) };
}

export default async function Home({ searchParams }: { searchParams: Promise<{ prompt?: string }> }) {
  const { prompt } = await searchParams;
  const t = await getTranslations("home.page");
  const locale = (await getLocale()) as Locale;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  scheduleIntervalsImportIfStale(user.id);

  const today = romeDay();
  const monday = mondayOf(today);
  const sunday = addDays(monday, 6);
  // Margin around the week: a session counts as done even with a run
  // up to two days before or after (matchPlan).
  const range = matchWindow(monday, sunday);
  const [goalRes, nextRes, weekPlanRes, weekActivitiesRes, messagesRes, proposalsRes, aiStatus, pendingEvaluationsRes, firstRun, syncIssues] = await Promise.all([
    supabase.from("goals").select("race_name, race_date, distance_m, target_time_s, created_at").eq("user_id", user.id).eq("is_active", true).maybeSingle<Pick<Goal, "race_name" | "race_date" | "distance_m" | "target_time_s" | "created_at">>(),
    // The first is the featured session; the others go in the desktop column.
    supabase.from("planned_workouts").select("*").eq("user_id", user.id).eq("status", "planned").gte("date", today).order("date").order("created_at").limit(8).returns<PlannedWorkout[]>(),
    supabase.from("planned_workouts").select("*").eq("user_id", user.id).gte("date", range.from).lte("date", range.to).returns<PlannedWorkout[]>(),
    supabase.from("activities").select("id, started_at, type, sport, distance_m, duration_s, moving_time_s").eq("user_id", user.id).is("excluded_at", null).gte("started_at", `${addDays(range.from, -1)}T12:00:00`).lte("started_at", `${addDays(range.to, 1)}T12:00:00`).returns<Array<Pick<Activity, "id" | "started_at" | "type" | "sport" | "distance_m" | "duration_s" | "moving_time_s">>>(),
    supabase.from("coach_messages").select("*").eq("user_id", user.id).in("kind", ["chat", "plan_proposal", "status"]).order("created_at", { ascending: false }).limit(60).returns<CoachMessage[]>(),
    supabase.from("plan_proposals").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10).returns<PlanProposal[]>(),
    getAiStatus(supabase, user.id),
    supabase.from("ai_jobs").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("kind", "evaluation").eq("status", "pending").gte("created_at", staleAiJobCutoff()),
    firstRunSteps(supabase, user.id),
    loadSyncIssues(supabase, user.id),
  ]);

  const authName = typeof user.user_metadata?.full_name === "string"
    ? user.user_metadata.full_name
    : typeof user.user_metadata?.name === "string"
      ? user.user_metadata.name
      : null;
  const name = authName?.split(" ")[0] ?? user.email?.split("@")[0] ?? t("fallbackName");
  // All sessions of the next scheduled day (even two or more), in their
  // order. Today the ones already run are marked done and the first to do is featured.
  const nextSessions = sortByDayOrder(nextRes.data ?? []);
  const nextDate = nextSessions[0]?.date ?? null;
  const daySessions = nextSessions.filter((workout) => workout.date === nextDate);
  const upcoming = nextSessions.filter((workout) => workout.date !== nextDate);
  // Done: with a run today or, if moved, on a nearby day.
  const legacySteps = (workout: PlannedWorkout) => workoutStepsOrLegacy(workout.workout_steps, workout);
  const weekMatch = matchPlan(
    (weekPlanRes.data ?? []).map((workout) => ({ ...workout, workout_steps: legacySteps(workout) })),
    withinWindow(weekActivitiesRes.data ?? [], range),
  );
  const doneToday = nextDate === today
    ? new Set(daySessions.filter((workout) => weekMatch.has(workout.id)).map((workout) => workout.id))
    : new Set<string>();
  const next = daySessions.find((workout) => !doneToday.has(workout.id)) ?? daySessions[0] ?? null;
  const sameDay = daySessions
    .filter((workout) => workout.id !== next?.id)
    .map((workout) => ({ workout, done: doneToday.has(workout.id) }));
  const goal = goalRes.data;
  const phases = goal ? trainingPhases({ race_date: goal.race_date, distance_m: goal.distance_m, start_date: romeDay(goal.created_at), today }) : null;
  const week = buildDays(monday, 7, today, weekPlanRes.data ?? [], weekActivitiesRes.data ?? [], legacySteps);
  const heat = next && next.type !== "cross" && daysBetween(today, next.date) <= 2
    ? (await heatForDates(supabase, user.id, [next.date])).get(next.date) ?? null
    : null;
  // Race today or just past (within three weeks): the card changes.
  const race = goal?.race_date && goal.race_date <= today && daysBetween(goal.race_date, today) <= 21
    ? { name: goal.race_name, date: goal.race_date }
    : null;

  return (
    <AppShell fill wide>
      {/* Desktop: chat on the left at full height, side column on the right
          (greeting, session, week, then the following sessions and the goal),
          which opens into two columns on large monitors. On phones the
          column containers generate no box (contents): the order stays
          greeting, session, first steps, chat. */}
      <div className="flex h-full min-h-0 flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:grid-rows-[minmax(0,1fr)] lg:gap-x-6 3xl:grid-cols-[minmax(0,1fr)_45.5rem]">
        <aside className="contents lg:col-start-2 lg:row-start-1 lg:-m-2 lg:flex lg:min-h-0 lg:flex-col lg:overflow-y-auto lg:p-2 3xl:grid 3xl:grid-cols-2 3xl:content-start 3xl:items-start 3xl:gap-x-6">
          {/* No big title: the home H1 is the next session. */}
          <div className="mb-4 flex shrink-0 items-center justify-between gap-3 pt-1 3xl:col-span-2">
            <div className="min-w-0">
              <p className="eyebrow truncate">{t(`greeting.${greetingKey()}`, { name })}</p>
              <p className="mt-1 text-caption text-muted-foreground first-letter:uppercase">{longDate(today, locale)}</p>
            </div>
            <Link
              href="/activities/new"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform active:scale-90"
              aria-label={t("logActivity")}
              title={t("logActivity")}
            >
              <Plus size={18} />
            </Link>
          </div>
          <div className="contents 3xl:block">
            {/* Sync in error or stale data: one line above the session. */}
            <SyncHealthBanner issues={syncIssues} className="mb-3 shrink-0" />
            <div className="mb-3 shrink-0">
              <TodayCard next={next} sameDay={sameDay} sessionsThatDay={daySessions.length} today={today} heat={heat} week={week} race={race} />
            </div>
            {/* First use: three steps above the chat; hides itself once steps are done. */}
            <GettingStarted {...firstRun} aiReady={aiStatus.chat.active !== null} className="mb-3 shrink-0" />
          </div>
          <div className="hidden shrink-0 space-y-3 lg:block">
            <UpcomingCard workouts={upcoming} today={today} />
            <GoalCard goal={goal} today={today} phases={phases} />
          </div>
        </aside>
        <div className="flex min-h-0 flex-1 basis-0 flex-col lg:col-start-1 lg:row-start-1">
          <Suspense fallback={<div className="skeleton min-h-0 flex-1 rounded-3xl" />}>
            <CoachChat key={prompt ?? ""} messages={withFailureMarks([...(messagesRes.data ?? [])].reverse())} proposals={withProposalExpiry(proposalsRes.data ?? [], today)} ai={aiStatus.chat} analyzingActivities={pendingEvaluationsRes.count ?? 0} />
          </Suspense>
        </div>
      </div>
    </AppShell>
  );
}

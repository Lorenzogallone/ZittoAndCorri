import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ChevronRight, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { Section } from "@/components/section";
import { WorkoutGraph } from "@/components/workout-graph";
import { activeDuration, formatDistance, formatDuration, formatPace } from "@/lib/format";
import { workoutHeadline } from "@/lib/workout-guide";
import { workoutStepsOrLegacy } from "@/lib/workout-steps";
import { plannedMeters } from "@/lib/plan/planned-distance";
import { addDays, relativeDayLabel, romeDay, weekdayName } from "@/lib/local-date";
import { buildDays } from "@/lib/plan/day-status";
import { matchWindow } from "@/lib/plan/match-activities";
import { SPORT_LABELS, TYPE_DOTS, TYPE_LABELS } from "@/lib/activity-meta";
import { cn } from "@/lib/utils";
import { sessionPlacement, sortByDayOrder } from "@/lib/plan/day-sessions";
import type { Activity, PlannedWorkout } from "@/lib/types";

function isValidDate(d: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  return !Number.isNaN(new Date(d + "T00:00:00").getTime());
}

interface Props {
  params: Promise<{ date: string }>;
}

type DayActivity = Pick<Activity, "id" | "started_at" | "type" | "sport" | "distance_m" | "duration_s" | "moving_time_s" | "avg_pace_s_km" | "avg_hr">;

export default async function DayViewPage({ params }: Props) {
  const t = await getTranslations("plan");
  const { date } = await params;
  if (!isValidDate(date)) notFound();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Sedute e corse attorno al giorno: una seduta vale fatta anche con una
  // corsa fino a due giorni prima o dopo (matchPlan).
  const range = matchWindow(date);
  const [{ data: planned }, { data: activities }] = await Promise.all([
    supabase
      .from("planned_workouts")
      .select("*")
      .eq("user_id", user.id)
      .gte("date", range.from)
      .lte("date", range.to)
      .order("created_at")
      .returns<PlannedWorkout[]>(),
    supabase
      .from("activities")
      .select("id, started_at, type, sport, distance_m, duration_s, moving_time_s, avg_pace_s_km, avg_hr")
      .eq("user_id", user.id)
      .is("excluded_at", null)
      .gte("started_at", `${addDays(range.from, -1)}T12:00:00`)
      .lte("started_at", `${addDays(range.to, 1)}T12:00:00`)
      .order("started_at")
      .returns<DayActivity[]>(),
  ]);

  const today = romeDay();
  const [day] = buildDays(date, 1, today, planned ?? [], activities ?? [], (workout) => workoutStepsOrLegacy(workout.workout_steps, workout));
  const workouts = sortByDayOrder(day.workouts);
  const dayActivities = day.activities;

  return (
    <AppShell backHref="/plan" backLabel={t("title")} hideTabBar>
      <h1 className="mb-6 text-2xl font-bold tracking-tight capitalize">{relativeDayLabel(date, today)}</h1>

      <Section
        title={t("day.planned")}
        action={<Link href="/plan/new" className="inline-flex items-center gap-1 text-sm font-medium text-primary"><Plus size={15} /> {t("day.add")}</Link>}
      >
        {workouts.length ? (
          <ul className="surface divide-y divide-border/60 px-4">
            {workouts.map((workout) => {
              const steps = workoutStepsOrLegacy(workout.workout_steps, workout);
              const meters = plannedMeters({ ...workout, workout_steps: steps });
              const placement = sessionPlacement(workout, workouts.length);
              const moved = day.doneOn[workout.id];
              const details = [moved ? t("day.doneOn", { weekday: weekdayName(moved.date) }) : null, placement, meters > 0 ? `≈ ${formatDistance(meters)}` : null].filter(Boolean).join(" · ");
              return (
                <li key={workout.id}>
                  <Link href={`/plan/${workout.id}`} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className={cn("flex items-center gap-2 text-sm font-medium", workout.status === "skipped" && "text-muted-foreground line-through")}>
                        <span className={cn("h-2 w-2 shrink-0 rounded-full", TYPE_DOTS[workout.type])} />
                        {[TYPE_LABELS[workout.type], workoutHeadline(steps)].filter(Boolean).join(" · ")}
                      </p>
                      {details && <p className="mt-0.5 text-xs text-muted-foreground">{details}</p>}
                      <WorkoutGraph steps={steps} type={workout.type} size="sm" className="mt-2" />
                    </div>
                    <ChevronRight size={16} className="shrink-0 text-muted-foreground/60" />
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="surface px-4 py-3 text-sm text-muted-foreground">{t("day.rest")}</p>
        )}
      </Section>

      <Section
        title={t("day.done")}
        action={<Link href="/activities/new" className="inline-flex items-center gap-1 text-sm font-medium text-primary"><Plus size={15} /> {t("day.record")}</Link>}
      >
        {dayActivities.length ? (
          <ul className="surface divide-y divide-border/60 px-4">
            {dayActivities.map((activity) => (
              <li key={activity.id}>
                <Link href={`/activities/${activity.id}`} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium tabular-nums">
                      {activity.sport === "running" ? TYPE_LABELS[activity.type] : SPORT_LABELS[activity.sport]}
                      {" · "}
                      {activity.distance_m > 0 ? formatDistance(activity.distance_m) : formatDuration(activeDuration(activity))}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                      {[
                        day.countsFor[activity.id] ? t("day.sessionOf", { weekday: weekdayName(day.countsFor[activity.id]) }) : null,
                        formatDuration(activeDuration(activity)),
                        activity.sport === "running" && activity.avg_pace_s_km != null ? formatPace(activity.avg_pace_s_km) : null,
                        activity.avg_hr != null ? `${activity.avg_hr} bpm` : null,
                      ].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <ChevronRight size={16} className="shrink-0 text-muted-foreground/60" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="surface px-4 py-3 text-sm text-muted-foreground">{t("day.noActivities")}</p>
        )}
      </Section>
    </AppShell>
  );
}

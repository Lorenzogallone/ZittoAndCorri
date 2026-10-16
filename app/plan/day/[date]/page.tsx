import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronRight, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { Section } from "@/components/section";
import { WorkoutGraph } from "@/components/workout-graph";
import { activeDuration, formatDistance, formatDuration, formatPace } from "@/lib/format";
import { workoutHeadline } from "@/lib/workout-guide";
import { workoutStepsOrLegacy } from "@/lib/workout-steps";
import { plannedMeters } from "@/lib/plan/planned-distance";
import { addDays, relativeDayLabel, romeDay } from "@/lib/local-date";
import { SPORT_LABELS, TYPE_DOTS, TYPE_LABELS } from "@/lib/activity-meta";
import { cn } from "@/lib/utils";
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
  const { date } = await params;
  if (!isValidDate(date)) notFound();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: planned }, { data: activities }] = await Promise.all([
    supabase
      .from("planned_workouts")
      .select("*")
      .eq("user_id", user.id)
      .eq("date", date)
      .order("created_at")
      .returns<PlannedWorkout[]>(),
    supabase
      .from("activities")
      .select("id, started_at, type, sport, distance_m, duration_s, moving_time_s, avg_pace_s_km, avg_hr")
      .eq("user_id", user.id)
      .gte("started_at", `${addDays(date, -1)}T12:00:00`)
      .lte("started_at", `${addDays(date, 1)}T12:00:00`)
      .order("started_at")
      .returns<DayActivity[]>(),
  ]);

  const workouts = planned ?? [];
  const dayActivities = (activities ?? []).filter((activity) => romeDay(activity.started_at) === date);
  const today = romeDay();

  return (
    <AppShell backHref="/plan" backLabel="Piano" hideTabBar>
      <h1 className="mb-6 text-2xl font-bold tracking-tight capitalize">{relativeDayLabel(date, today)}</h1>

      <Section
        title="In programma"
        action={<Link href="/plan/new" className="inline-flex items-center gap-1 text-sm font-medium text-primary"><Plus size={15} /> Aggiungi</Link>}
      >
        {workouts.length ? (
          <ul className="divide-y divide-border/60">
            {workouts.map((workout) => {
              const steps = workoutStepsOrLegacy(workout.workout_steps, workout);
              const meters = plannedMeters({ ...workout, workout_steps: steps });
              return (
                <li key={workout.id}>
                  <Link href={`/plan/${workout.id}`} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className={cn("flex items-center gap-2 text-sm font-medium", workout.status === "skipped" && "text-muted-foreground line-through")}>
                        <span className={cn("h-2 w-2 shrink-0 rounded-full", TYPE_DOTS[workout.type])} />
                        {[TYPE_LABELS[workout.type], workoutHeadline(steps)].filter(Boolean).join(" · ")}
                      </p>
                      {meters > 0 && <p className="mt-0.5 text-xs text-muted-foreground">≈ {formatDistance(meters)}</p>}
                      <WorkoutGraph steps={steps} type={workout.type} size="sm" className="mt-2" />
                    </div>
                    <ChevronRight size={16} className="shrink-0 text-muted-foreground/60" />
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Giorno di riposo.</p>
        )}
      </Section>

      <Section
        title="Fatto"
        action={<Link href="/activities/new" className="inline-flex items-center gap-1 text-sm font-medium text-primary"><Plus size={15} /> Registra</Link>}
      >
        {dayActivities.length ? (
          <ul className="divide-y divide-border/60">
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
          <p className="text-sm text-muted-foreground">Nessuna attività registrata.</p>
        )}
      </Section>
    </AppShell>
  );
}

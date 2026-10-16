import Link from "next/link";
import { cn } from "@/lib/utils";
import { DayStateIcon } from "@/components/day-state-icon";
import { TYPE_DOTS, TYPE_LABELS, SPORT_LABELS } from "@/lib/activity-meta";
import { formatDistance, formatDuration, formatPace, activeDuration } from "@/lib/format";
import { workoutHeadline } from "@/lib/workout-guide";
import { plannedMeters } from "@/lib/plan/planned-distance";
import { estimateWorkout } from "@/lib/workout-estimate";
import { adherence, type DayView } from "@/lib/plan/day-status";
import type { Activity, PlannedWorkout } from "@/lib/types";

export type PlanActivity = Pick<Activity, "id" | "started_at" | "type" | "sport" | "distance_m" | "duration_s" | "moving_time_s" | "avg_pace_s_km">;
export type PlanDay = DayView<PlannedWorkout, PlanActivity>;

const kmText = (meters: number) => `${(meters / 1000).toLocaleString("it-IT", { maximumFractionDigits: 1 })} km`;

function rangeLabel(start: string, end: string): string {
  const format = (iso: string, withMonth: boolean) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString("it-IT", withMonth ? { day: "numeric", month: "long", timeZone: "UTC" } : { day: "numeric", timeZone: "UTC" });
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  return `${format(start, !sameMonth)} – ${format(end, true)}`;
}

function workoutTitle(workout: PlannedWorkout): string {
  const detail = workoutHeadline(workout.workout_steps ?? []);
  return detail ? `${TYPE_LABELS[workout.type]} · ${detail}` : TYPE_LABELS[workout.type];
}

function workoutSubtitle(workout: PlannedWorkout): string {
  if (workout.status === "skipped") return "In pausa";
  const meters = plannedMeters(workout);
  const seconds = workout.target_duration_s ?? (workout.workout_steps?.length ? estimateWorkout(workout.workout_steps).seconds : null);
  const parts = [
    meters > 0 ? `${workout.target_distance_m ? "" : "≈ "}${kmText(meters)}` : null,
    seconds ? `${Math.round(seconds / 60)} min` : null,
    workout.adapted_from ? "alleggerita" : null,
  ];
  return parts.filter(Boolean).join(" · ");
}

function activitySummary(activity: PlanActivity, withSport = true): string {
  const isRun = activity.sport === "running";
  return [
    !isRun && withSport ? SPORT_LABELS[activity.sport] : null,
    activity.distance_m > 0 ? formatDistance(activity.distance_m) : formatDuration(activeDuration(activity)),
    isRun && activity.avg_pace_s_km ? formatPace(activity.avg_pace_s_km) : null,
  ].filter(Boolean).join(" · ");
}

function dayHref(day: PlanDay): string {
  if (day.workouts.length === 1) return `/plan/${day.workouts[0].id}`;
  if (!day.workouts.length && day.activities.length === 1) return `/activities/${day.activities[0].id}`;
  return `/plan/day/${day.date}`;
}

function DayRow({ day, today }: { day: PlanDay; today: string }) {
  const date = new Date(`${day.date}T12:00:00Z`);
  const weekday = date.toLocaleDateString("it-IT", { weekday: "short", timeZone: "UTC" }).replace(".", "");
  const workout = day.workouts[0];
  const isToday = day.date === today;
  const done = day.state === "done" || day.state === "extra";
  const activity = day.activities[0];

  let title: string;
  let subtitle: string | null = null;
  let dot: string | null = null;
  if (workout) {
    title = workoutTitle(workout) + (day.workouts.length > 1 ? ` +${day.workouts.length - 1}` : "");
    subtitle = done && activity ? `Fatto · ${activitySummary(activity)}` : workoutSubtitle(workout);
    dot = TYPE_DOTS[workout.type];
  } else if (activity) {
    title = activity.sport === "running" ? "Corsa extra" : SPORT_LABELS[activity.sport];
    subtitle = activitySummary(activity, false);
  } else {
    title = "Riposo";
  }

  return (
    <li>
      <Link
        href={dayHref(day)}
        className={cn("flex items-center gap-3 py-2.5 transition-colors active:bg-muted/40", isToday && "-mx-2 rounded-xl bg-primary/[0.07] px-2")}
      >
        <div className="w-9 shrink-0 text-center">
          <p className={cn("text-[10px] uppercase tracking-wide", isToday ? "font-semibold text-primary" : "text-muted-foreground")}>{weekday}</p>
          <p className={cn("text-base font-semibold tabular-nums leading-tight", isToday && "text-primary")}>{date.getUTCDate()}</p>
        </div>
        <div className="min-w-0 flex-1">
          <p className={cn(
            "flex items-center gap-2 truncate text-sm",
            workout || activity ? "font-medium" : "text-muted-foreground",
            day.state === "skipped" && "text-muted-foreground line-through",
          )}>
            {dot && <span className={cn("h-2 w-2 shrink-0 rounded-full", dot)} />}
            <span className="truncate">{title}</span>
          </p>
          {subtitle && <p className="mt-0.5 truncate text-xs text-muted-foreground tabular-nums">{subtitle}</p>}
        </div>
        <DayStateIcon state={day.state} />
      </Link>
    </li>
  );
}

/** Una settimana del piano: km fatti/previsti e un giorno per riga. */
export function PlanWeek({ days, today, title, highlight = false }: { days: PlanDay[]; today: string; title?: string; highlight?: boolean }) {
  const planned = days.flatMap((day) => day.workouts).reduce((sum, workout) => sum + (workout.status === "skipped" ? 0 : plannedMeters(workout)), 0);
  const done = days.flatMap((day) => day.activities).filter((activity) => activity.sport === "running").reduce((sum, activity) => sum + activity.distance_m, 0);
  const { done: sessionsDone, due } = adherence(days.map((day) => day.state));
  const progress = planned > 0 ? Math.min(1, done / planned) : 0;
  return (
    <section className={cn("mb-6", highlight ? "surface px-4 pb-1 pt-4" : "px-1 opacity-90")}>
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h2 className={cn("text-[15px] font-semibold", !highlight && "text-muted-foreground")}>
          {title ?? rangeLabel(days[0].date, days[days.length - 1].date)}
        </h2>
        <p className="text-xs text-muted-foreground tabular-nums">
          {kmText(done)}{planned > 0 && <span> / {kmText(planned)}</span>}
        </p>
      </div>
      {planned > 0 && (
        <div className="mb-1 h-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div className="h-full rounded-full bg-primary" style={{ width: `${progress * 100}%` }} />
        </div>
      )}
      {due > 0 && (
        <p className="mb-1 text-[11px] text-muted-foreground">{sessionsDone} su {due} sedute fatte</p>
      )}
      <ul className="divide-y divide-border/60">
        {days.map((day) => <DayRow key={day.date} day={day} today={today} />)}
      </ul>
    </section>
  );
}

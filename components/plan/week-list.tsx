import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { DEFAULT_LOCALE, intlLocale, type Locale, type Translator } from "@/i18n/config";
import { cn } from "@/lib/utils";
import { DayStateIcon } from "@/components/day-state-icon";
import { TYPE_DOTS, typeLabel, sportLabel } from "@/lib/activity-meta";
import { formatDistance, formatDuration, formatPace, activeDuration } from "@/lib/format";
import { workoutHeadline } from "@/lib/workout-guide";
import { plannedMeters } from "@/lib/plan/planned-distance";
import { estimateWorkout } from "@/lib/workout-estimate";
import { adherence, type DayView } from "@/lib/plan/day-status";
import { weekdayName } from "@/lib/local-date";
import type { Activity, PlannedWorkout } from "@/lib/types";

export type PlanActivity = Pick<Activity, "id" | "started_at" | "type" | "sport" | "distance_m" | "duration_s" | "moving_time_s" | "avg_pace_s_km">;
export type PlanDay = DayView<PlannedWorkout, PlanActivity>;

const kmText = (meters: number, locale: Locale) => `${(meters / 1000).toLocaleString(intlLocale(locale), { maximumFractionDigits: 1 })} km`;

function rangeLabel(start: string, end: string, locale: Locale): string {
  const format = (iso: string, withMonth: boolean) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString(intlLocale(locale), withMonth ? { day: "numeric", month: "long", timeZone: "UTC" } : { day: "numeric", timeZone: "UTC" });
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  return `${format(start, !sameMonth)} – ${format(end, true)}`;
}

/** `tl` is the translator of the "labels" namespace. */
export function workoutTitle(workout: PlannedWorkout, tl: Translator, locale: Locale = DEFAULT_LOCALE): string {
  const detail = workoutHeadline(workout.workout_steps ?? [], locale);
  return detail ? `${typeLabel(tl, workout.type)} · ${detail}` : typeLabel(tl, workout.type);
}

/** `t` is the translator of the "plan.week" scope (keys `paused` and `lightened`). */
export function workoutSubtitle(workout: PlannedWorkout, t: (key: "paused" | "lightened") => string, locale: Locale = DEFAULT_LOCALE): string {
  if (workout.status === "skipped") return t("paused");
  const meters = plannedMeters(workout);
  const seconds = workout.target_duration_s ?? (workout.workout_steps?.length ? estimateWorkout(workout.workout_steps).seconds : null);
  const parts = [
    meters > 0 ? `${workout.target_distance_m ? "" : "≈ "}${kmText(meters, locale)}` : null,
    seconds ? `${Math.round(seconds / 60)} min` : null,
    workout.adapted_from ? t("lightened") : null,
  ];
  return parts.filter(Boolean).join(" · ");
}

function activitySummary(activity: PlanActivity, tl: Translator, locale: Locale, withSport = true): string {
  const isRun = activity.sport === "running";
  return [
    !isRun && withSport ? sportLabel(tl, activity.sport) : null,
    activity.distance_m > 0 ? formatDistance(activity.distance_m, locale) : formatDuration(activeDuration(activity)),
    isRun && activity.avg_pace_s_km ? formatPace(activity.avg_pace_s_km) : null,
  ].filter(Boolean).join(" · ");
}

function dayHref(day: PlanDay): string {
  if (day.workouts.length === 1) return `/plan/${day.workouts[0].id}`;
  if (!day.workouts.length && day.activities.length === 1) return `/activities/${day.activities[0].id}`;
  return `/plan/day/${day.date}`;
}

function DayRow({ day, today }: { day: PlanDay; today: string }) {
  const t = useTranslations("plan.week");
  const tl = useTranslations("labels");
  const locale = useLocale() as Locale;
  const date = new Date(`${day.date}T12:00:00Z`);
  const weekday = date.toLocaleDateString(intlLocale(locale), { weekday: "short", timeZone: "UTC" }).replace(".", "");
  const workout = day.workouts[0];
  const isToday = day.date === today;
  const done = day.state === "done" || day.state === "extra";
  const activity = day.activities[0];
  // Session done on another day (within two days before or after).
  const moved = workout ? day.doneOn[workout.id] : undefined;
  const sameDayRun = !moved && activity && !(activity.id in day.countsFor) ? activity : undefined;

  let title: string;
  let subtitle: string | null = null;
  let dot: string | null = null;
  if (workout) {
    title = workoutTitle(workout, tl, locale) + (day.workouts.length > 1 ? ` +${day.workouts.length - 1}` : "");
    subtitle = moved
      ? t("doneOn", { weekday: weekdayName(moved.date, locale), summary: activitySummary(moved.activity, tl, locale) })
      : done && sameDayRun ? t("done", { summary: activitySummary(sameDayRun, tl, locale) }) : workoutSubtitle(workout, t, locale);
    dot = TYPE_DOTS[workout.type];
  } else if (activity) {
    const countsFor = day.countsFor[activity.id];
    title = countsFor
      ? t("sessionOf", { weekday: weekdayName(countsFor, locale) })
      : activity.sport === "running" ? t("extraRun") : sportLabel(tl, activity.sport);
    subtitle = activitySummary(activity, tl, locale, false);
  } else {
    title = t("rest");
  }

  return (
    <li>
      <Link
        href={dayHref(day)}
        className={cn(
          // -mx-2/px-2: the press tint extends beyond the text without shifting it.
          "-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/60 active:bg-muted/60",
          // From 2xl the day is a box of the week (seven in a row).
          "2xl:relative 2xl:mx-0 2xl:h-full 2xl:min-h-24 2xl:flex-col 2xl:items-stretch 2xl:gap-2 2xl:rounded-xl 2xl:bg-surface-2 2xl:p-3",
          // Today: accent tint and solid mark on the left.
          isToday && "bg-primary/10 2xl:bg-primary/10",
        )}
      >
        <div className="w-9 shrink-0 text-center 2xl:flex 2xl:w-auto 2xl:items-baseline 2xl:gap-1.5 2xl:pr-7 2xl:text-left">
          <p className={cn("text-micro uppercase tracking-wide", isToday ? "font-semibold text-primary" : "text-muted-foreground")}>{weekday}</p>
          <p className={cn("font-display text-heading font-bold tabular-nums leading-tight", isToday && "text-primary")}>{date.getUTCDate()}</p>
        </div>
        <div className="min-w-0 flex-1">
          <p className={cn(
            "flex items-center gap-2 truncate text-body",
            workout || activity ? "font-medium" : "text-muted-foreground",
            day.state === "skipped" && "text-muted-foreground line-through",
          )}>
            {dot && <span className={cn("h-2 w-2 shrink-0 rounded-full", dot)} />}
            <span className="truncate">{title}</span>
          </p>
          {subtitle && <p className="mt-0.5 truncate text-caption text-muted-foreground tabular-nums">{subtitle}</p>}
        </div>
        <span className="flex shrink-0 2xl:absolute 2xl:right-2.5 2xl:top-2.5">
          <DayStateIcon state={day.state} />
        </span>
      </Link>
    </li>
  );
}

/** A plan week: km done/planned and one day per row. */
export function PlanWeek({ days, today, title, highlight = false }: { days: PlanDay[]; today: string; title?: string; highlight?: boolean }) {
  const t = useTranslations("plan.week");
  const locale = useLocale() as Locale;
  const planned = days.flatMap((day) => day.workouts).reduce((sum, workout) => sum + (workout.status === "skipped" ? 0 : plannedMeters(workout)), 0);
  const done = days.flatMap((day) => day.activities).filter((activity) => activity.sport === "running").reduce((sum, activity) => sum + activity.distance_m, 0);
  const { done: sessionsDone, due } = adherence(days.map((day) => day.state));
  const progress = planned > 0 ? Math.min(1, done / planned) : 0;
  return (
    <section className={cn("mb-6", highlight ? "surface px-4 pb-1 pt-4 2xl:pb-4" : "px-1 opacity-90")}>
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h2 className={cn("text-body font-semibold", !highlight && "text-muted-foreground")}>
          {title ?? rangeLabel(days[0].date, days[days.length - 1].date, locale)}
        </h2>
        <p className="text-caption text-muted-foreground tabular-nums">
          {kmText(done, locale)}{planned > 0 && <span> / {kmText(planned, locale)}</span>}
        </p>
      </div>
      {planned > 0 && (
        <div className="mb-1 h-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div className="h-full rounded-full bg-primary" style={{ width: `${progress * 100}%` }} />
        </div>
      )}
      {due > 0 && (
        <p className="mb-1 text-micro text-muted-foreground">{t("sessionsDone", { done: sessionsDone, due })}</p>
      )}
      <ul className="divide-y divide-border/60 2xl:mt-3 2xl:grid 2xl:grid-cols-7 2xl:gap-2 2xl:divide-y-0">
        {days.map((day) => <DayRow key={day.date} day={day} today={today} />)}
      </ul>
    </section>
  );
}

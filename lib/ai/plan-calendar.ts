// Compact calendar for the coach: day by day planned sessions, runs
// done and whether the day can still be changed. The week is labeled
// relative to today, so "next week" means the same thing for
// the athlete and for the model. Pure functions.

import type { DayPart, WorkoutStepInput, WorkoutType } from "@/lib/types";
import { addDays, mondayOf } from "../local-date.ts";
import { sortByDayOrder } from "../plan/day-sessions.ts";
import { workoutHeadline } from "../workout-guide.ts";

const WEEKDAYS = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];

export interface CalendarDay {
  date: string;
  weekday: string;
  week: string;
  /** Already run or with a completed session: existing sessions are not touched. */
  locked: boolean;
  /** Already run but from today onwards: sessions can be added (e.g. the second of the day). */
  add_only: boolean;
  /** Past day: a session left here was not done; it can only be removed (remove_dates), not added. */
  past: boolean;
  /**
   * Sessions in day order. part: morning/afternoon/evening; chained:
   * done right after the previous one, as a single outing split into several workouts.
   */
  planned: Array<{ type: WorkoutType; status: string; what: string; order: number; part: DayPart | null; chained: boolean }>;
  done: Array<{ sport: string; km: number | null; minutes: number }>;
}

function weekLabel(offset: number): string {
  if (offset === 0) return "questa settimana";
  if (offset === 1) return "settimana prossima";
  if (offset === -1) return "settimana scorsa";
  return offset > 0 ? `tra ${offset} settimane` : `${-offset} settimane fa`;
}

function what(workout: { type: WorkoutType; target_distance_m: number | null; target_duration_s: number | null; workout_steps?: WorkoutStepInput[] | null }): string {
  const headline = workout.workout_steps?.length ? workoutHeadline(workout.workout_steps) : null;
  const amount = workout.target_distance_m
    ? `${Math.round(workout.target_distance_m / 100) / 10} km`
    : workout.target_duration_s
      ? `${Math.round(workout.target_duration_s / 60)} min`
      : null;
  return [workout.type, headline, amount].filter(Boolean).join(" · ");
}

export function planCalendar(input: {
  today: string;
  from: string;
  to: string;
  workouts: Array<{ date: string; type: WorkoutType; status: string; target_distance_m: number | null; target_duration_s: number | null; workout_steps?: WorkoutStepInput[] | null; day_order?: number | null; day_part?: DayPart | null; chained?: boolean | null }>;
  /** Activities with the day already in Europe/Rome. */
  activities: Array<{ day: string; sport: string; distance_m: number; seconds: number }>;
}): CalendarDay[] {
  const { today, from, to } = input;
  const thisMonday = mondayOf(today);
  const days: CalendarDay[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const planned = sortByDayOrder(input.workouts.filter((w) => w.date === date));
    const done = input.activities.filter((a) => a.day === date);
    const offset = Math.round((Date.parse(`${mondayOf(date)}T12:00:00Z`) - Date.parse(`${thisMonday}T12:00:00Z`)) / (7 * 86_400_000));
    const locked = done.some((a) => a.sport === "running") || planned.some((w) => w.status === "completed");
    days.push({
      date,
      weekday: WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()],
      week: weekLabel(offset),
      locked,
      add_only: locked && date >= today,
      past: date < today,
      planned: planned.map((w) => ({ type: w.type, status: w.status, what: what(w), order: w.day_order ?? 1, part: w.day_part ?? null, chained: w.chained === true })),
      done: done.map((a) => ({ sport: a.sport, km: a.distance_m > 0 ? Math.round(a.distance_m / 100) / 10 : null, minutes: Math.round(a.seconds / 60) })),
    });
  }
  return days;
}

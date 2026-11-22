// Stato di ogni giorno del piano: fatto, saltato, in programma, riposo.
// Piano e attività non hanno un legame esplicito: un giorno con una seduta di
// corsa è "fatto" se quel giorno c'è una corsa (o la seduta è segnata a mano)
// oppure se la seduta è stata fatta fino a due giorni prima o dopo (matchPlan).
// Funzioni pure.

import { addDays, romeDay } from "../local-date.ts";
import { sortByDayOrder, type DaySession } from "./day-sessions.ts";
import { matchPlan, matchWindow, withinWindow, type PlanMatchActivity, type PlanMatchWorkout } from "./match-activities.ts";

export type DayState = "done" | "missed" | "today" | "planned" | "rest" | "extra" | "skipped";

export interface DayPlanned {
  type: string;
  status: string;
}

export interface DayActivity {
  sport: string;
}

export function dayState(input: {
  date: string;
  today: string;
  planned: DayPlanned[];
  activities: DayActivity[];
  /** Una seduta del giorno è stata fatta in un altro giorno. */
  doneElsewhere?: boolean;
}): DayState {
  const active = input.planned.filter((workout) => workout.status !== "skipped");
  if (!active.length) {
    if (input.activities.length) return "extra";
    return input.planned.length ? "skipped" : "rest";
  }
  const ran = input.activities.some((activity) => activity.sport === "running");
  const done = active.some((workout) =>
    workout.status === "completed" || (workout.type === "cross" ? input.activities.length > 0 : ran),
  );
  if (done || input.doneElsewhere) return "done";
  if (input.date < input.today) return "missed";
  return input.date === input.today ? "today" : "planned";
}

/** Sedute dovute (passate o di oggi già fatte) e quante sono state fatte. */
export function adherence(states: DayState[]): { done: number; due: number } {
  let done = 0;
  let due = 0;
  for (const state of states) {
    if (state === "done") {
      done += 1;
      due += 1;
    } else if (state === "missed") {
      due += 1;
    }
  }
  return { done, due };
}

export interface DayView<W, A> {
  date: string;
  state: DayState;
  workouts: W[];
  activities: A[];
  /** Sedute del giorno fatte in un altro giorno: id seduta → giorno e corsa. */
  doneOn: Record<string, { date: string; activity: A }>;
  /** Corse del giorno che valgono per la seduta di un altro giorno: id corsa → giorno della seduta. */
  countsFor: Record<string, string>;
}

/**
 * Giorni consecutivi da `start` con sedute, attività e stato. Per vedere le
 * sedute spostate ai bordi, sedute e attività vanno caricate anche per
 * MATCH_MARGIN_DAYS prima e dopo (matchWindow): si mostrano solo i giorni chiesti.
 * `matchSteps` dà i passi da usare per l'abbinamento (es. quelli ricavati dai
 * campi legacy), senza cambiare le sedute mostrate.
 */
export function buildDays<W extends DayPlanned & DaySession & PlanMatchWorkout, A extends DayActivity & PlanMatchActivity>(
  start: string,
  count: number,
  today: string,
  workouts: W[],
  activities: A[],
  matchSteps?: (workout: W) => PlanMatchWorkout["workout_steps"],
): DayView<W, A>[] {
  const match = matchPlan(
    matchSteps ? workouts.map((workout) => ({ ...workout, workout_steps: matchSteps(workout) })) : workouts,
    withinWindow(activities, matchWindow(start, addDays(start, count - 1))),
  );
  const activityById = new Map(activities.map((activity) => [activity.id, activity]));
  const workoutDate = new Map(workouts.map((workout) => [workout.id, workout.date]));
  const workoutFor = new Map([...match].map(([workoutId, activityId]) => [activityId, workoutId]));
  return Array.from({ length: count }, (_, index) => {
    const date = addDays(start, index);
    const dayWorkouts = sortByDayOrder(workouts.filter((workout) => workout.date === date));
    const dayActivities = activities.filter((activity) => romeDay(activity.started_at) === date);
    const doneOn: DayView<W, A>["doneOn"] = {};
    for (const workout of dayWorkouts) {
      const activity = activityById.get(match.get(workout.id) ?? "");
      const activityDay = activity ? romeDay(activity.started_at) : date;
      if (activity && activityDay !== date) doneOn[workout.id] = { date: activityDay, activity };
    }
    const countsFor: Record<string, string> = {};
    for (const activity of dayActivities) {
      const other = workoutDate.get(workoutFor.get(activity.id) ?? "");
      if (other && other !== date) countsFor[activity.id] = other;
    }
    return {
      date,
      workouts: dayWorkouts,
      activities: dayActivities,
      doneOn,
      countsFor,
      state: dayState({
        date,
        today,
        planned: dayWorkouts,
        activities: dayActivities,
        doneElsewhere: dayWorkouts.some((workout) => workout.status !== "skipped" && workout.id in doneOn),
      }),
    };
  });
}

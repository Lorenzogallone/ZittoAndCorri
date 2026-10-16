// Stato di ogni giorno del piano: fatto, saltato, in programma, riposo.
// Piano e attività non hanno un legame esplicito: un giorno con una seduta di
// corsa è "fatto" se quel giorno c'è una corsa (o la seduta è segnata a mano).
// Funzioni pure.

import { addDays, romeDay } from "../local-date.ts";

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
  if (done) return "done";
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
}

/** Giorni consecutivi da `start` con sedute, attività e stato. */
export function buildDays<W extends DayPlanned & { date: string }, A extends DayActivity & { started_at: string }>(
  start: string,
  count: number,
  today: string,
  workouts: W[],
  activities: A[],
): DayView<W, A>[] {
  return Array.from({ length: count }, (_, index) => {
    const date = addDays(start, index);
    const dayWorkouts = workouts.filter((workout) => workout.date === date);
    const dayActivities = activities.filter((activity) => romeDay(activity.started_at) === date);
    return {
      date,
      workouts: dayWorkouts,
      activities: dayActivities,
      state: dayState({ date, today, planned: dayWorkouts, activities: dayActivities }),
    };
  });
}

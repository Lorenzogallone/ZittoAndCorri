// Abbina le sedute pianificate di un giorno alle attività fatte quel giorno.
// Con più sedute e più corse nello stesso giorno (riscaldamento e ripetute,
// mattina e sera) la prima corsa non è per forza la prima seduta: si sceglie
// l'abbinamento che somiglia di più per distanza, durata, ordine e momento
// della giornata. Funzioni pure.

import type { DayPart, WorkoutStepInput, WorkoutType } from "../types.ts";
import { plannedMeters } from "./planned-distance.ts";
import { estimateWorkout } from "../workout-estimate.ts";

export interface MatchWorkout {
  id: string;
  type: WorkoutType;
  status?: string;
  target_distance_m: number | null;
  target_duration_s: number | null;
  target_pace_s_km?: number | null;
  workout_steps?: WorkoutStepInput[] | null;
  day_order?: number | null;
  day_part?: DayPart | null;
}

export interface MatchActivity {
  id: string;
  started_at: string;
  sport: string;
  distance_m: number;
  duration_s: number;
  moving_time_s?: number | null;
}

/** Ora del giorno a Roma (0-23). */
function romeHour(iso: string): number {
  return Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Europe/Rome" }).format(new Date(iso))) % 24;
}

function partOf(hour: number): DayPart {
  return hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
}

/** Quanto la seduta e l'attività sono diverse (0 = uguali). Infinity se incompatibili. */
function cost(workout: MatchWorkout, activity: MatchActivity, workoutRank: number, activityRank: number): number {
  if (workout.type !== "cross" && activity.sport !== "running") return Infinity;
  const steps = workout.workout_steps ?? [];
  const meters = plannedMeters({ ...workout, workout_steps: steps });
  const seconds = workout.target_duration_s ?? (steps.length ? estimateWorkout(steps).seconds : 0);
  const active = activity.moving_time_s ?? activity.duration_s;
  const gaps: number[] = [];
  if (meters > 0 && activity.distance_m > 0) gaps.push(Math.abs(Math.log(activity.distance_m / meters)));
  if (seconds > 0 && active > 0) gaps.push(Math.abs(Math.log(active / seconds)));
  let total = gaps.length ? gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length : 0.5;
  // A parità di somiglianza conta l'ordine: la prima seduta con la prima corsa.
  total += Math.abs(workoutRank - activityRank) * 0.15;
  if (workout.day_part && workout.day_part !== partOf(romeHour(activity.started_at))) total += 0.5;
  return total;
}

/**
 * Abbinamento seduta → attività di un giorno: il massimo numero di coppie e,
 * tra questi, quello più simile. Ogni attività vale per una sola seduta.
 * Ritorna id seduta → id attività (le sedute senza corsa non compaiono).
 */
export function matchDay(workouts: MatchWorkout[], activities: MatchActivity[]): Map<string, string> {
  const plan = [...workouts]
    .filter((workout) => workout.status !== "skipped")
    .map((workout, index) => ({ workout, index }))
    .sort((a, b) => (a.workout.day_order ?? 1) - (b.workout.day_order ?? 1) || a.index - b.index)
    .map(({ workout }) => workout);
  const done = [...activities].sort((a, b) => a.started_at.localeCompare(b.started_at));
  const result = new Map<string, string>();
  if (!plan.length || !done.length) return result;

  const costs = plan.map((workout, i) => done.map((activity, j) => cost(workout, activity, i, j)));
  // Poche sedute e poche corse al giorno: si provano tutte le combinazioni.
  if (plan.length <= 6 && done.length <= 6) {
    let best: { pairs: number; total: number; choice: number[] } = { pairs: 0, total: Infinity, choice: [] };
    const choice = new Array<number>(plan.length).fill(-1);
    const used = new Set<number>();
    const walk = (i: number, pairs: number, total: number) => {
      if (i === plan.length) {
        if (pairs > best.pairs || (pairs === best.pairs && total < best.total)) best = { pairs, total, choice: [...choice] };
        return;
      }
      for (let j = 0; j < done.length; j++) {
        if (used.has(j) || !Number.isFinite(costs[i][j])) continue;
        used.add(j);
        choice[i] = j;
        walk(i + 1, pairs + 1, total + costs[i][j]);
        used.delete(j);
      }
      choice[i] = -1;
      walk(i + 1, pairs, total);
    };
    walk(0, 0, 0);
    best.choice.forEach((j, i) => {
      if (j >= 0) result.set(plan[i].id, done[j].id);
    });
    return result;
  }
  // Giornate fuori dal comune: in ordine, la prima corsa compatibile libera.
  const used = new Set<number>();
  plan.forEach((workout, i) => {
    const j = done.findIndex((_, index) => !used.has(index) && Number.isFinite(costs[i][index]));
    if (j >= 0) {
      used.add(j);
      result.set(workout.id, done[j].id);
    }
  });
  return result;
}

/** La seduta abbinata a un'attività, se c'è. */
export function workoutForActivity<W extends MatchWorkout>(activityId: string, workouts: W[], activities: MatchActivity[]): W | null {
  const match = matchDay(workouts, activities);
  for (const workout of workouts) {
    if (match.get(workout.id) === activityId) return workout;
  }
  return null;
}

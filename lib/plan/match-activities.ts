// Abbina le sedute pianificate di un giorno alle attività fatte quel giorno.
// Con più sedute e più corse nello stesso giorno (riscaldamento e ripetute,
// mattina e sera) la prima corsa non è per forza la prima seduta: si sceglie
// l'abbinamento che somiglia di più per distanza, durata, ordine e momento
// della giornata. Una seduta rimasta senza corsa vale fatta anche con una
// corsa dello stesso tipo fatta fino a due giorni prima o dopo (matchPlan).
// Funzioni pure.

import type { DayPart, WorkoutStepInput, WorkoutType } from "../types.ts";
import { plannedMeters } from "./planned-distance.ts";
import { estimateWorkout } from "../workout-estimate.ts";
import { addDays, daysBetween, romeDay } from "../local-date.ts";

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

/** Differenza media (log) di distanza e durata; null se non si può dire. */
function gap(workout: MatchWorkout, activity: MatchActivity): number | null {
  const steps = workout.workout_steps ?? [];
  const meters = plannedMeters({ ...workout, workout_steps: steps });
  const seconds = workout.target_duration_s ?? (steps.length ? estimateWorkout(steps).seconds : 0);
  const active = activity.moving_time_s ?? activity.duration_s;
  const gaps: number[] = [];
  if (meters > 0 && activity.distance_m > 0) gaps.push(Math.abs(Math.log(activity.distance_m / meters)));
  if (seconds > 0 && active > 0) gaps.push(Math.abs(Math.log(active / seconds)));
  return gaps.length ? gaps.reduce((sum, value) => sum + value, 0) / gaps.length : null;
}

/** Quanto la seduta e l'attività sono diverse (0 = uguali). Infinity se incompatibili. */
function cost(workout: MatchWorkout, activity: MatchActivity, workoutRank: number, activityRank: number): number {
  if (workout.type !== "cross" && activity.sport !== "running") return Infinity;
  let total = gap(workout, activity) ?? 0.5;
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

// ── Sedute spostate di giorno ───────────────────────────────────────────────

/** Fino a quanti giorni prima o dopo una corsa vale per una seduta rimasta senza. */
export const SHIFT_DAYS = 2;
/**
 * Margine da caricare attorno ai giorni mostrati: le corse a ±SHIFT_DAYS e le
 * sedute che se le contendono (a loro volta a ±SHIFT_DAYS da quelle corse).
 */
export const MATCH_MARGIN_DAYS = 2 * SHIFT_DAYS;

export interface PlanMatchWorkout extends MatchWorkout {
  date: string;
}

export interface PlanMatchActivity extends MatchActivity {
  /** Tipo della corsa; "unclassified" o assente = non ancora deciso. */
  type?: string | null;
}

/** Tipi di corsa che valgono per una seduta fatta in un altro giorno. Gara e cross restano nel loro giorno. */
const SHIFT_TYPES: Partial<Record<WorkoutType, string[]>> = {
  easy: ["easy", "recovery"],
  recovery: ["easy", "recovery"],
  long: ["long"],
  tempo: ["tempo"],
  interval: ["interval"],
};
/** Corsa senza tipo: deve somigliare alla seduta (distanza e durata entro ~35%). */
const UNTYPED_MAX_GAP = 0.3;

function shiftable(workout: PlanMatchWorkout, activity: PlanMatchActivity): boolean {
  const types = SHIFT_TYPES[workout.type];
  if (!types || activity.sport !== "running") return false;
  if (activity.type && activity.type !== "unclassified") return types.includes(activity.type);
  const value = gap(workout, activity);
  return value != null && value <= UNTYPED_MAX_GAP;
}

/**
 * Abbinamento seduta → attività su più giorni. Prima ogni giorno con le sue
 * corse (matchDay: la corsa dello stesso giorno ha sempre la precedenza e
 * nessuna seduta già fatta nel suo giorno viene tolta). Poi le sedute rimaste
 * senza corsa prendono una corsa rimasta libera dello stesso tipo, fino a
 * SHIFT_DAYS giorni prima o dopo: prima la più vicina, a parità quella fatta
 * dopo la seduta (spostata in avanti), poi la più simile. Ritorna id seduta →
 * id attività. Per un risultato stabile servono sedute e corse anche per
 * MATCH_MARGIN_DAYS attorno ai giorni che interessano.
 */
export function matchPlan(workouts: PlanMatchWorkout[], activities: PlanMatchActivity[]): Map<string, string> {
  const result = new Map<string, string>();
  const dayOf = new Map(activities.map((activity) => [activity.id, romeDay(activity.started_at)]));
  for (const date of [...new Set(workouts.map((workout) => workout.date))].sort()) {
    const dayMatch = matchDay(
      workouts.filter((workout) => workout.date === date),
      activities.filter((activity) => dayOf.get(activity.id) === date),
    );
    for (const [workoutId, activityId] of dayMatch) result.set(workoutId, activityId);
  }

  const used = new Set(result.values());
  const pairs: Array<{ workout: PlanMatchWorkout; activity: PlanMatchActivity; distance: number; earlier: number; similarity: number }> = [];
  for (const workout of workouts) {
    if (workout.status === "skipped" || result.has(workout.id)) continue;
    for (const activity of activities) {
      if (used.has(activity.id)) continue;
      const shift = daysBetween(workout.date, dayOf.get(activity.id)!);
      if (shift === 0 || Math.abs(shift) > SHIFT_DAYS || !shiftable(workout, activity)) continue;
      pairs.push({ workout, activity, distance: Math.abs(shift), earlier: shift < 0 ? 1 : 0, similarity: gap(workout, activity) ?? 0.5 });
    }
  }
  pairs.sort((a, b) =>
    a.distance - b.distance
    || a.earlier - b.earlier
    || a.similarity - b.similarity
    || a.workout.date.localeCompare(b.workout.date)
    || a.workout.id.localeCompare(b.workout.id)
    || a.activity.started_at.localeCompare(b.activity.started_at)
    || a.activity.id.localeCompare(b.activity.id));
  for (const { workout, activity } of pairs) {
    if (result.has(workout.id) || used.has(activity.id)) continue;
    result.set(workout.id, activity.id);
    used.add(activity.id);
  }
  return result;
}

/** La seduta abbinata a un'attività su più giorni (vedi matchPlan), se c'è. */
export function planWorkoutForActivity<W extends PlanMatchWorkout>(activityId: string, workouts: W[], activities: PlanMatchActivity[]): W | null {
  const match = matchPlan(workouts, activities);
  return workouts.find((workout) => match.get(workout.id) === activityId) ?? null;
}

/**
 * Solo le attività dei giorni della finestra: quelle caricate in più per il
 * fuso orario non hanno le loro sedute e sembrerebbero libere.
 */
export function withinWindow<A extends MatchActivity>(activities: A[], range: { from: string; to: string }): A[] {
  return activities.filter((activity) => {
    const day = romeDay(activity.started_at);
    return day >= range.from && day <= range.to;
  });
}

/** Intervallo di giorni da caricare per abbinare le sedute da `from` a `to`. */
export function matchWindow(from: string, to: string = from): { from: string; to: string } {
  return { from: addDays(from, -MATCH_MARGIN_DAYS), to: addDays(to, MATCH_MARGIN_DAYS) };
}

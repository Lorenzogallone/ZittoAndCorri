// Proposte del coach giorno per giorno. Il modello può restituire anche sedute
// identiche a quelle già in calendario o giorni che non può toccare: qui si
// tiene solo ciò che cambia davvero, e un giorno si svuota solo se la proposta
// lo chiede esplicitamente. Funzioni pure (la stessa protezione è ripetuta in
// SQL da apply_plan_proposal_v2).

import type { WorkoutStepInput, WorkoutType } from "@/lib/types";
import { estimateWorkout } from "../workout-estimate.ts";
import { stepVariant, workoutHeadline } from "../workout-guide.ts";

export interface PlanDayWorkout {
  date: string;
  type: WorkoutType;
  status?: string;
  target_distance_m: number | null;
  target_duration_s: number | null;
  target_pace_s_km?: number | null;
  target_hr_bpm?: number | null;
  workout_steps: WorkoutStepInput[];
  description?: string | null;
  focus?: string | null;
}

/** Seduta in breve, per il prima/dopo in chat. */
export interface WorkoutBrief {
  type: WorkoutType;
  headline: string | null;
  meters: number | null;
  minutes: number | null;
}

export interface ProposalChange {
  date: string;
  before: WorkoutBrief[];
  after: WorkoutBrief[];
}

export interface ProposalDiff<W extends PlanDayWorkout> {
  workouts: W[];
  removeDates: string[];
  /** Giorni che la proposta modifica davvero, in ordine. */
  touched: string[];
  changes: ProposalChange[];
  /** Giorni chiesti ma intoccabili (passati, già corsi, fuori finestra). */
  locked: string[];
}

export function briefOf(workout: PlanDayWorkout): WorkoutBrief {
  const steps = workout.workout_steps ?? [];
  const estimate = steps.length ? estimateWorkout(steps) : null;
  const meters = workout.target_distance_m ?? (estimate ? Math.round(estimate.meters / 100) * 100 : null);
  const seconds = workout.target_duration_s ?? (estimate ? estimate.seconds : null);
  return {
    type: workout.type,
    headline: steps.length ? workoutHeadline(steps) : null,
    meters: meters && meters > 0 ? meters : null,
    minutes: seconds && seconds > 0 ? Math.round(seconds / 60) : null,
  };
}

/** Impronta del contenuto di una seduta: uguale = nessuna modifica. */
function fingerprint(workout: PlanDayWorkout): string {
  return JSON.stringify([
    workout.type,
    workout.target_distance_m ?? null,
    workout.target_duration_s ?? null,
    workout.target_pace_s_km ?? null,
    workout.target_hr_bpm ?? null,
    (workout.workout_steps ?? []).map((step) => [
      step.kind, step.completion_type, step.completion_value ?? null,
      step.pace_min_s_km ?? null, step.pace_max_s_km ?? null,
      step.hr_min_bpm ?? null, step.hr_max_bpm ?? null, stepVariant(step),
    ]),
  ]);
}

const sameDay = (a: PlanDayWorkout[], b: PlanDayWorkout[]) =>
  a.length === b.length && a.map(fingerprint).sort().join("\n") === b.map(fingerprint).sort().join("\n");

export function planProposalDiff<W extends PlanDayWorkout>(input: {
  today: string;
  windowEnd: string;
  /** Sedute già in calendario nella finestra (qualsiasi stato). */
  existing: PlanDayWorkout[];
  /** Giorni con una corsa registrata (Europe/Rome). */
  activityDates: Set<string>;
  proposed: W[];
  removeDates: string[];
}): ProposalDiff<W> {
  const { today, windowEnd, existing, activityDates } = input;
  const editable = (w: PlanDayWorkout) => w.status !== "completed";
  const isLocked = (date: string) =>
    date < today || date > windowEnd || activityDates.has(date) ||
    existing.some((w) => w.date === date && w.status === "completed");
  const existingOn = (date: string) => existing.filter((w) => w.date === date && editable(w));

  const byDate = new Map<string, W[]>();
  for (const workout of input.proposed) byDate.set(workout.date, [...(byDate.get(workout.date) ?? []), workout]);

  const locked = new Set<string>();
  const workouts: W[] = [];
  const changed = new Set<string>();
  for (const [date, list] of byDate) {
    if (isLocked(date)) {
      locked.add(date);
      continue;
    }
    // Il modello ripete una seduta senza cambiarla: non è una modifica.
    if (sameDay(existingOn(date), list)) continue;
    workouts.push(...list);
    changed.add(date);
  }

  const removeDates: string[] = [];
  for (const date of [...new Set(input.removeDates)].sort()) {
    if (byDate.has(date)) continue;
    if (isLocked(date)) {
      if (existingOn(date).length) locked.add(date);
      continue;
    }
    // Svuotare un giorno già vuoto non cambia nulla.
    if (!existingOn(date).length) continue;
    removeDates.push(date);
    changed.add(date);
  }

  const touched = [...changed].sort();
  return {
    workouts: workouts.sort((a, b) => a.date.localeCompare(b.date)),
    removeDates,
    touched,
    changes: touched.map((date) => ({
      date,
      before: existingOn(date).map(briefOf),
      after: (byDate.get(date) ?? []).map(briefOf),
    })),
    locked: [...locked].sort(),
  };
}

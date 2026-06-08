// Accosta i workout pianificati e le corse reali giorno per giorno, su un
// intervallo di date. Riusato dalla vista giorno (UI) e dal contesto AI, così
// la logica "piano vs reale" vive in un punto solo.
import type { PlannedWorkout, Activity } from "@/lib/types";

export interface DayPlanVsActual<W, A> {
  /** "YYYY-MM-DD" */
  date: string;
  planned: W[];
  actual: A[];
}

type DatedWorkout = Pick<PlannedWorkout, "date"> & Record<string, unknown>;
type DatedActivity = Pick<Activity, "started_at"> & Record<string, unknown>;

/**
 * Raggruppa per giorno (chiave "YYYY-MM-DD") i workout pianificati (per `date`)
 * e le corse reali (per il giorno di `started_at`). L'output è ordinato per
 * data crescente e include solo i giorni con almeno un elemento.
 */
export function buildPlanVsActual<
  W extends DatedWorkout,
  A extends DatedActivity,
>(workouts: W[], activities: A[]): DayPlanVsActual<W, A>[] {
  const byDate = new Map<string, DayPlanVsActual<W, A>>();

  const ensure = (date: string): DayPlanVsActual<W, A> => {
    let entry = byDate.get(date);
    if (!entry) {
      entry = { date, planned: [], actual: [] };
      byDate.set(date, entry);
    }
    return entry;
  };

  for (const w of workouts) {
    ensure(w.date).planned.push(w);
  }
  for (const a of activities) {
    ensure(a.started_at.slice(0, 10)).actual.push(a);
  }

  return [...byDate.values()].sort((x, y) => x.date.localeCompare(y.date));
}

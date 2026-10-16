// Volume settimanale di corsa: fatto contro previsto. Funzioni pure.

import { addDays, romeDay } from "../local-date.ts";
import { plannedMeters } from "./planned-distance.ts";

export interface WeekVolume {
  week_start: string;
  done_m: number;
  planned_m: number;
}

export function weeklyVolume(
  activities: Array<{ started_at: string; sport: string; distance_m: number }>,
  planned: Array<Parameters<typeof plannedMeters>[0] & { date: string; status?: string }>,
  firstMonday: string,
  weeks: number,
): WeekVolume[] {
  const out: WeekVolume[] = Array.from({ length: weeks }, (_, index) => ({
    week_start: addDays(firstMonday, index * 7),
    done_m: 0,
    planned_m: 0,
  }));
  const indexOf = (day: string) => {
    const diff = Math.floor(
      (new Date(`${day}T12:00:00Z`).getTime() - new Date(`${firstMonday}T12:00:00Z`).getTime()) / (7 * 86_400_000),
    );
    return diff >= 0 && diff < weeks ? diff : -1;
  };
  for (const activity of activities) {
    if (activity.sport !== "running") continue;
    const index = indexOf(romeDay(activity.started_at));
    if (index >= 0) out[index].done_m += activity.distance_m;
  }
  for (const workout of planned) {
    if (workout.status === "skipped") continue;
    const index = indexOf(workout.date);
    if (index >= 0) out[index].planned_m += plannedMeters(workout);
  }
  return out;
}

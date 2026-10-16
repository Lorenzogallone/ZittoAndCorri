// Settimane di recupero dopo una gara: poche uscite brevi e facili, che
// crescono gradualmente. Funzioni pure.

import type { ProposedWorkout } from "@/lib/types";
import { addDays } from "../local-date.ts";

/** [giorni dopo la gara, minuti] */
function template(distance: number): Array<[number, number]> {
  if (distance >= 42_000) return [[4, 20], [6, 25], [8, 30], [10, 35], [12, 40]];
  if (distance >= 21_000) return [[3, 20], [5, 30], [7, 35], [9, 40]];
  return [[2, 25], [4, 35], [6, 40]];
}

export function recoveryWorkouts(input: {
  race_date: string;
  distance_m: number;
  today: string;
  hr_cap: number | null;
}): ProposedWorkout[] {
  const until = addDays(input.today, 13);
  return template(input.distance_m)
    .map(([offset, minutes], index) => ({ date: addDays(input.race_date, offset), minutes, index }))
    .filter(({ date }) => date >= input.today && date <= until)
    .map(({ date, minutes, index }) => ({
      date,
      type: index === 0 ? "recovery" : "easy",
      target_distance_m: null,
      target_pace_s_km: null,
      target_duration_s: minutes * 60,
      target_hr_bpm: input.hr_cap,
      workout_steps: [{
        kind: "steady",
        label: "Facile, ritmo da chiacchierata",
        completion_type: "time",
        completion_value: minutes * 60,
        pace_min_s_km: null,
        pace_max_s_km: null,
        hr_min_bpm: null,
        hr_max_bpm: input.hr_cap,
      }],
      description: `${minutes} minuti di corsa facile, senza guardare il passo. Dopo la gara muscoli e tendini hanno bisogno di qualche giorno in più dei polmoni: queste uscite riattivano le gambe senza affaticarle.`,
      focus: "Se senti dolori o le gambe sono ancora pesanti, cammina o riposa: recuperare bene adesso è ciò che ti fa ripartire più forte.",
    }));
}

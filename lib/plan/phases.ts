// Fasi indicative di preparazione verso una gara con data. Funzioni pure.

import { addDays, daysBetween } from "../local-date.ts";

export type PhaseKey = "base" | "build" | "peak" | "taper";

export interface Phase {
  key: PhaseKey;
  label: string;
  start: string;
  end: string;
  weeks: number;
}

export interface PhasePlan {
  phases: Phase[];
  current: PhaseKey | null;
  /** Avanzamento 0-1 dall'inizio della preparazione alla gara. */
  progress: number;
  weeks_left: number;
}

const LABELS: Record<PhaseKey, string> = {
  base: "Base",
  build: "Costruzione",
  peak: "Picco",
  taper: "Scarico",
};

function taperWeeks(distance: number): number {
  if (distance >= 42_000) return 3;
  if (distance >= 21_000) return 2;
  return 1;
}

export function trainingPhases(input: {
  race_date: string | null;
  distance_m: number;
  start_date: string;
  today: string;
}): PhasePlan | null {
  const { race_date: race, today } = input;
  if (!race || race < today) return null;
  const start = input.start_date < race ? input.start_date : today;
  const totalWeeks = Math.max(1, Math.ceil(daysBetween(start, race) / 7));
  const taper = Math.min(taperWeeks(input.distance_m), Math.max(1, totalWeeks - 1));
  const rest = totalWeeks - taper;

  let counts: Array<[PhaseKey, number]>;
  if (rest <= 0) {
    counts = [["taper", totalWeeks]];
  } else if (rest < 3) {
    counts = [["build", rest], ["taper", taper]];
  } else {
    const base = Math.max(1, Math.round(rest * 0.4));
    const peak = Math.max(1, Math.round(rest * 0.25));
    const build = Math.max(1, rest - base - peak);
    counts = [["base", rest - build - peak], ["build", build], ["peak", peak], ["taper", taper]];
  }

  // Le fasi si contano a ritroso dalla gara, così lo scarico finisce il giorno prima.
  const phases: Phase[] = [];
  let end = addDays(race, -1);
  for (let index = counts.length - 1; index >= 0; index--) {
    const [key, weeks] = counts[index];
    const phaseStart = index === 0 ? start : addDays(end, -weeks * 7 + 1);
    phases.unshift({ key, label: LABELS[key], start: phaseStart, end, weeks });
    end = addDays(phaseStart, -1);
  }

  const current = phases.find((phase) => today >= phase.start && today <= phase.end)?.key ?? null;
  const span = Math.max(1, daysBetween(start, race));
  return {
    phases,
    current,
    progress: Math.min(1, Math.max(0, daysBetween(start, today) / span)),
    weeks_left: Math.max(0, Math.ceil(daysBetween(today, race) / 7)),
  };
}

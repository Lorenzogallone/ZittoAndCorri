// Traduce i workout_steps di una seduta in istruzioni leggibili: raggruppa le
// ripetizioni ("6 × 400 m + 90\" recupero") e spiega ogni fase a parole.
import type { WorkoutStepInput, WorkoutType } from "@/lib/types";

export type StepBlock<S extends WorkoutStepInput = WorkoutStepInput> =
  | { kind: "single"; step: S }
  | { kind: "repeat"; times: number; steps: S[] };

export const STEP_KIND_LABELS: Record<WorkoutStepInput["kind"], string> = {
  warmup: "Riscaldamento",
  work: "Tratto veloce",
  recovery: "Recupero",
  steady: "Corsa continua",
  cooldown: "Defaticamento",
};

/** Spiegazione breve, per chi non conosce il gergo, di ogni tipo di seduta. */
export const WORKOUT_TYPE_GUIDE: Record<WorkoutType, string> = {
  easy: "Corsa facile: ritmo da chiacchierata, devi riuscire a parlare in frasi complete. Se il fiato si accorcia o il cuore sale oltre il limite, rallenta: andare piano qui è la cosa giusta.",
  recovery: "Corsa di recupero: ancora più piano di una easy. Serve solo a sciogliere le gambe dopo giorni impegnativi.",
  long: "Lungo: la corsa più lunga della settimana, sempre a ritmo facile. Conta il tempo passato sulle gambe, non la velocità.",
  tempo: "Tempo (soglia): ritmo «comodamente impegnativo», riesci a dire solo poche parole. Tienilo costante dall'inizio alla fine del tratto, senza partire forte.",
  interval: "Ripetute: tratti veloci alternati a recuperi. Corri ogni tratto veloce al passo indicato, poi recupera (camminando o corricchiando piano) per il tempo indicato e ripeti il blocco il numero di volte indicato. Punta a tenere lo stesso passo su tutte le ripetute: meglio la prima un filo più lenta che l'ultima in crisi.",
  race: "Gara o test: sforzo massimo che riesci a sostenere su tutta la distanza. Riscaldati bene prima e parti controllato.",
  cross: "Allenamento alternativo (es. palestra o altro sport): segui la durata indicata.",
};

function sameStep(a: WorkoutStepInput, b: WorkoutStepInput): boolean {
  return a.kind === b.kind &&
    a.completion_type === b.completion_type &&
    a.completion_value === b.completion_value &&
    a.pace_min_s_km === b.pace_min_s_km &&
    a.pace_max_s_km === b.pace_max_s_km &&
    a.hr_min_bpm === b.hr_min_bpm &&
    a.hr_max_bpm === b.hr_max_bpm;
}

function matchesAt<S extends WorkoutStepInput>(steps: S[], at: number, pattern: S[], length = pattern.length): boolean {
  if (at + length > steps.length) return false;
  for (let i = 0; i < length; i += 1) {
    if (!sameStep(steps[at + i], pattern[i])) return false;
  }
  return true;
}

/**
 * Raggruppa sequenze ripetute consecutive (es. lavoro+recupero × 6). L'ultima
 * ripetizione può omettere il recupero finale, come succede quasi sempre.
 */
export function groupWorkoutSteps<S extends WorkoutStepInput>(steps: S[]): StepBlock<S>[] {
  const blocks: StepBlock<S>[] = [];
  let i = 0;
  while (i < steps.length) {
    let best: { length: number; times: number; covered: number } | null = null;
    for (let length = 1; length <= 8; length += 1) {
      const pattern = steps.slice(i, i + length);
      if (pattern.length < length || !pattern.some((step) => step.kind === "work")) continue;
      let times = 1;
      while (matchesAt(steps, i + times * length, pattern)) times += 1;
      let covered = times * length;
      const trailing = pattern[length - 1];
      if (length > 1 && trailing.kind === "recovery" && matchesAt(steps, i + covered, pattern, length - 1)) {
        times += 1;
        covered += length - 1;
      }
      if (times >= 2 && (!best || covered > best.covered)) best = { length, times, covered };
    }
    if (best) {
      blocks.push({ kind: "repeat", times: best.times, steps: steps.slice(i, i + best.length) });
      i += best.covered;
    } else {
      blocks.push({ kind: "single", step: steps[i] });
      i += 1;
    }
  }
  return blocks;
}

function clock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.round(totalSeconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Durata o distanza di una fase in forma leggibile: 400 m, 2 km, 10', 90". */
export function formatStepAmount(step: WorkoutStepInput): string | null {
  const value = step.completion_value;
  if (step.completion_type === "manual" || value == null) return null;
  if (step.completion_type === "distance") {
    if (value >= 1000) {
      const km = value / 1000;
      return `${km.toFixed(2).replace(/\.?0+$/, "").replace(".", ",")} km`;
    }
    return `${value} m`;
  }
  if (value < 120 && value % 60 !== 0) return `${value}"`;
  if (value % 60 === 0) return `${value / 60}'`;
  return `${Math.floor(value / 60)}'${String(value % 60).padStart(2, "0")}"`;
}

export function formatStepPace(step: WorkoutStepInput): string | null {
  const { pace_min_s_km: min, pace_max_s_km: max } = step;
  if (min != null && max != null) return min === max ? `${clock(min)}/km` : `${clock(min)}–${clock(max)}/km`;
  if (min != null) return `più lento di ${clock(min)}/km`;
  if (max != null) return `non più veloce di ${clock(max)}/km`;
  return null;
}

export function formatStepHr(step: WorkoutStepInput): string | null {
  const { hr_min_bpm: min, hr_max_bpm: max } = step;
  if (min != null && max != null) return `${min}–${max} bpm`;
  if (max != null) return `≤ ${max} bpm`;
  if (min != null) return `≥ ${min} bpm`;
  return null;
}

/** Frase completa per una singola fase, es. "400 m a 4:20–4:30/km". */
export function describeStep(step: WorkoutStepInput): string {
  const amount = formatStepAmount(step);
  const pace = formatStepPace(step);
  const hr = formatStepHr(step);
  const parts = [amount ?? "a sensazione"];
  if (pace) parts.push(`a ${pace}`);
  if (hr) parts.push(`(cuore ${hr})`);
  return parts.join(" ");
}

/** Titolo sintetico della seduta, es. "6 × 400 m" o "3 × 8'". */
export function workoutHeadline(steps: WorkoutStepInput[]): string | null {
  const repeat = groupWorkoutSteps(steps).find((block) => block.kind === "repeat");
  if (!repeat || repeat.kind !== "repeat") return null;
  const work = repeat.steps
    .filter((step) => step.kind === "work")
    .map((step) => formatStepAmount(step) ?? step.label);
  if (!work.length) return null;
  return `${repeat.times} × ${work.length > 1 ? `(${work.join(" + ")})` : work[0]}`;
}

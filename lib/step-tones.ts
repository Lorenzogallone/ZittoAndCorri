// Colori dei tratti, uguali tra seduta prevista (WorkoutGraph) e corsa reale
// (scheda Ripetute): azzurro lento → rosso veloce, viola per gli sprint
// ("oltre il rosso"), grigio per camminata e sosta.

export interface StepTone {
  bar: string;
  dot: string;
  text: string;
}

export const TONES = {
  sprint: { bar: "bg-violet-500", dot: "bg-violet-500", text: "text-violet-600 dark:text-violet-400" },
  hard: { bar: "bg-rose-500", dot: "bg-rose-500", text: "text-rose-600 dark:text-rose-400" },
  tempo: { bar: "bg-amber-400", dot: "bg-amber-400", text: "text-amber-600 dark:text-amber-400" },
  moderate: { bar: "bg-emerald-400", dot: "bg-emerald-400", text: "text-emerald-600 dark:text-emerald-400" },
  jog: { bar: "bg-sky-300 dark:bg-sky-500/60", dot: "bg-sky-300", text: "text-sky-600 dark:text-sky-400" },
  easy: { bar: "bg-sky-400", dot: "bg-sky-400", text: "text-sky-600 dark:text-sky-400" },
  walk: { bar: "bg-zinc-300 dark:bg-zinc-600", dot: "bg-zinc-400", text: "text-zinc-500 dark:text-zinc-400" },
} satisfies Record<string, StepTone>;

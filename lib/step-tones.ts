// Step colors, the same between planned session (WorkoutGraph) and actual run
// (Intervals tab): light blue slow → red fast, purple for sprints
// ("beyond red"), gray for walking and rest.

import type { Translator } from "../i18n/config.ts";

export interface StepTone {
  bar: string;
  dot: string;
  text: string;
  /** The same color in hex, for map and SVG (Tailwind palette). */
  hex: string;
}

export const TONES = {
  sprint: { bar: "bg-violet-500", dot: "bg-violet-500", text: "text-violet-600 dark:text-violet-400", hex: "#8b5cf6" },
  hard: { bar: "bg-rose-500", dot: "bg-rose-500", text: "text-rose-600 dark:text-rose-400", hex: "#f43f5e" },
  tempo: { bar: "bg-amber-400", dot: "bg-amber-400", text: "text-amber-600 dark:text-amber-400", hex: "#fbbf24" },
  moderate: { bar: "bg-emerald-400", dot: "bg-emerald-400", text: "text-emerald-600 dark:text-emerald-400", hex: "#34d399" },
  jog: { bar: "bg-sky-300 dark:bg-sky-500/60", dot: "bg-sky-300", text: "text-sky-600 dark:text-sky-400", hex: "#7dd3fc" },
  easy: { bar: "bg-sky-400", dot: "bg-sky-400", text: "text-sky-600 dark:text-sky-400", hex: "#38bdf8" },
  walk: { bar: "bg-zinc-300 dark:bg-zinc-600", dot: "bg-zinc-400", text: "text-zinc-500 dark:text-zinc-400", hex: "#a1a1aa" },
} satisfies Record<string, StepTone>;

export type ToneKey = keyof typeof TONES;

/** Translated label of the color/step (`t` bound to the "labels" namespace). */
export const toneLabel = (t: Translator, key: ToneKey): string => t(`tone.${key}`);

/** Color of a run step: the same in the Intervals tab, the graph and the map. */
export function segmentToneKey(segment: { kind: string; variant: string | null }): ToneKey {
  if (segment.variant === "sprint") return "sprint";
  if (segment.variant === "walk" || segment.variant === "stop") return "walk";
  if (segment.kind === "work") return "hard";
  if (segment.kind === "steady") return "tempo";
  if (segment.kind === "recovery") return "jog";
  return "easy";
}

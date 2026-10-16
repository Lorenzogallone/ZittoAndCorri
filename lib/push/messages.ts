// Testi brevi delle notifiche. Modulo puro: solo import relativi, testabile.
import type { WorkoutStepInput } from "@/lib/types";
import { workoutHeadline } from "../workout-guide.ts";
import { formatPlannedDistance } from "../format.ts";

/** Prima frase di un testo, senza markdown, al massimo `max` caratteri. */
export function firstSentence(text: string | null | undefined, max = 120): string {
  const clean = (text ?? "").replace(/[*_#`>]/g, "").replace(/\s+/g, " ").trim();
  const match = clean.match(/^.*?[.!?](?=\s|$)/);
  const sentence = (match?.[0] ?? clean).trim();
  if (sentence.length <= max) return sentence;
  const cut = sentence.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max / 2 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.]+$/, "")}…`;
}

/** Corpo della notifica "Analisi pronta". */
export function analysisPushBody(summary: string | null | undefined): string {
  return firstSentence(summary) || "Il coach ha commentato la tua corsa.";
}

/** Corpo del promemoria: "6 × 400 m · ~7,50 km". */
export function reminderBody(workout: {
  workout_steps?: WorkoutStepInput[] | null;
  target_distance_m?: number | null;
  target_duration_s?: number | null;
  target_pace_s_km?: number | null;
}): string {
  const headline = workoutHeadline(workout.workout_steps ?? []);
  const distance = formatPlannedDistance(workout)?.replace(".", ",") ?? null;
  const duration = !distance && workout.target_duration_s
    ? `${Math.round(workout.target_duration_s / 60)} min`
    : null;
  const parts = [headline, distance ?? duration].filter((part): part is string => Boolean(part));
  return parts.length ? parts.join(" · ") : "Apri per i dettagli della seduta.";
}

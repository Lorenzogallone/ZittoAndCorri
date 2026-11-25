// Short notification texts. Pure module: relative imports only, testable.
import type { WorkoutStepInput } from "@/lib/types";
import type { Locale, Translator } from "../../i18n/config.ts";
import { workoutHeadline } from "../workout-guide.ts";
import { formatPlannedDistance } from "../format.ts";

/** First sentence of a text, without markdown, at most `max` characters. */
export function firstSentence(text: string | null | undefined, max = 120): string {
  const clean = (text ?? "").replace(/[*_#`>]/g, "").replace(/\s+/g, " ").trim();
  const match = clean.match(/^.*?[.!?](?=\s|$)/);
  const sentence = (match?.[0] ?? clean).trim();
  if (sentence.length <= max) return sentence;
  const cut = sentence.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max / 2 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.]+$/, "")}…`;
}

/** Body of the "Analysis ready" notification (`t` bound to the "push" namespace). */
export function analysisPushBody(summary: string | null | undefined, t: Translator): string {
  return firstSentence(summary) || t("analysis.fallback");
}

/** Reminder body: "6 × 400 m · ~7,50 km" (`t` bound to the "push" namespace). */
export function reminderBody(workout: {
  workout_steps?: WorkoutStepInput[] | null;
  target_distance_m?: number | null;
  target_duration_s?: number | null;
  target_pace_s_km?: number | null;
}, t: Translator, locale: Locale): string {
  const headline = workoutHeadline(workout.workout_steps ?? [], locale);
  const distance = formatPlannedDistance(workout, locale) ?? null;
  const duration = !distance && workout.target_duration_s
    ? t("reminder.minutes", { minutes: Math.round(workout.target_duration_s / 60) })
    : null;
  const parts = [headline, distance ?? duration].filter((part): part is string => Boolean(part));
  return parts.length ? parts.join(" · ") : t("reminder.fallback");
}

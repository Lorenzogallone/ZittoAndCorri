// Shared metadata for workout types and sports: badge colors and icons, plus the
// labels ("labels" namespace, translated with typeLabel / sportLabel).
// Single source of truth — importable from both RSC and client components
// (no "server-only").
import {
  Activity as ActivityIcon,
  Bike,
  CircleDot,
  Dumbbell,
  Flower,
  Flower2,
  Footprints,
  Mountain,
  PersonStanding,
  Snowflake,
  Volleyball,
  Waves,
  type LucideIcon,
} from "lucide-react";
import type { Translator } from "@/i18n/config";
import type { ActivityType, Sport } from "@/lib/types";

// ── Workout types (running) ─────────────────────────────────────────────────────

/** Fixed Italian labels: only for prompts, database and coach context (the UI uses typeLabel). */
export const TYPE_LABELS_IT: Record<ActivityType, string> = {
  unclassified: "Corsa",
  easy: "Easy",
  tempo: "Tempo",
  interval: "Ripetute",
  long: "Lungo",
  race: "Gara",
  recovery: "Recupero",
  cross: "Cross",
};

/** Translated type label (`t` bound to the "labels" namespace); an unknown type is left as is. */
export function typeLabel(t: Translator, type: string): string {
  return Object.hasOwn(TYPE_COLORS, type) ? t(`type.${type}`) : type;
}

export const TYPE_COLORS: Record<ActivityType, string> = {
  unclassified: "bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary",
  easy: "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400",
  tempo: "bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400",
  interval: "bg-red-500/10 text-red-600 dark:bg-red-500/20 dark:text-red-400",
  long: "bg-violet-500/10 text-violet-600 dark:bg-violet-500/20 dark:text-violet-400",
  race: "bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary",
  recovery: "bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400",
  cross: "bg-zinc-500/10 text-zinc-600 dark:bg-zinc-500/20 dark:text-zinc-400",
};

/** Solid dot per session type (lists and calendar). */
export const TYPE_DOTS: Record<ActivityType, string> = {
  unclassified: "bg-primary",
  easy: "bg-emerald-500",
  tempo: "bg-amber-500",
  interval: "bg-rose-500",
  long: "bg-violet-500",
  race: "bg-primary",
  recovery: "bg-sky-500",
  cross: "bg-zinc-400",
};

// ── Sports ────────────────────────────────────────────────────────────────

/** Fixed Italian labels: only for prompts, database and coach context (the UI uses sportLabel). */
export const SPORT_LABELS_IT: Record<Sport, string> = {
  running: "Corsa",
  cycling: "Bici",
  swimming: "Nuoto",
  strength: "Palestra",
  hiking: "Escursione",
  walking: "Camminata",
  soccer: "Calcio",
  beach_volley: "Beach volley",
  tennis: "Tennis",
  padel: "Padel",
  yoga: "Yoga",
  pilates: "Pilates",
  ski: "Sci",
  other: "Altro",
};

/** Translated sport label (`t` bound to the "labels" namespace). */
export function sportLabel(t: Translator, sport: string): string {
  return Object.hasOwn(SPORT_COLORS, sport) ? t(`sport.${sport}`) : sport;
}

export const SPORT_ICONS: Record<Sport, LucideIcon> = {
  running: Footprints,
  cycling: Bike,
  swimming: Waves,
  strength: Dumbbell,
  hiking: Mountain,
  walking: PersonStanding,
  soccer: Volleyball,
  beach_volley: Volleyball,
  tennis: CircleDot,
  padel: CircleDot,
  yoga: Flower2,
  pilates: Flower,
  ski: Snowflake,
  other: ActivityIcon,
};

export const SPORT_COLORS: Record<Sport, string> = {
  running: "bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary",
  cycling: "bg-sky-500/10 text-sky-600 dark:bg-sky-500/20 dark:text-sky-400",
  swimming: "bg-cyan-500/10 text-cyan-600 dark:bg-cyan-500/20 dark:text-cyan-400",
  strength: "bg-orange-500/10 text-orange-600 dark:bg-orange-500/20 dark:text-orange-400",
  hiking: "bg-lime-500/10 text-lime-600 dark:bg-lime-500/20 dark:text-lime-400",
  walking: "bg-teal-500/10 text-teal-600 dark:bg-teal-500/20 dark:text-teal-400",
  soccer: "bg-green-500/10 text-green-600 dark:bg-green-500/20 dark:text-green-400",
  beach_volley: "bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400",
  tennis: "bg-yellow-500/10 text-yellow-600 dark:bg-yellow-500/20 dark:text-yellow-400",
  padel: "bg-yellow-500/10 text-yellow-600 dark:bg-yellow-500/20 dark:text-yellow-400",
  yoga: "bg-purple-500/10 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400",
  pilates: "bg-purple-500/10 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400",
  ski: "bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400",
  other: "bg-zinc-500/10 text-zinc-600 dark:bg-zinc-500/20 dark:text-zinc-400",
};

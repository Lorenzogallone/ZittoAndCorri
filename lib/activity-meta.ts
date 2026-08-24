// Metadati condivisi per tipi workout e sport: label italiane, colori badge e
// icone. Unica fonte di verità — importabile sia da RSC che da client
// component (niente "server-only").
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
import type { ActivityType, Sport } from "@/lib/types";

// ── Tipi workout (corsa) ─────────────────────────────────────────────────────

export const TYPE_LABELS: Record<ActivityType, string> = {
  unclassified: "Corsa",
  easy: "Easy",
  tempo: "Tempo",
  interval: "Ripetute",
  long: "Lungo",
  race: "Gara",
  recovery: "Recupero",
  cross: "Cross",
};

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

// ── Sport ────────────────────────────────────────────────────────────────────

export const SPORT_LABELS: Record<Sport, string> = {
  running: "Corsa",
  cycling: "Bici",
  swimming: "Nuoto",
  strength: "Palestra",
  hiking: "Escursione",
  walking: "Camminata",
  soccer: "Calcio",
  tennis: "Tennis",
  padel: "Padel",
  yoga: "Yoga",
  pilates: "Pilates",
  ski: "Sci",
  other: "Altro",
};

export const SPORT_ICONS: Record<Sport, LucideIcon> = {
  running: Footprints,
  cycling: Bike,
  swimming: Waves,
  strength: Dumbbell,
  hiking: Mountain,
  walking: PersonStanding,
  soccer: Volleyball,
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
  tennis: "bg-yellow-500/10 text-yellow-600 dark:bg-yellow-500/20 dark:text-yellow-400",
  padel: "bg-yellow-500/10 text-yellow-600 dark:bg-yellow-500/20 dark:text-yellow-400",
  yoga: "bg-purple-500/10 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400",
  pilates: "bg-purple-500/10 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400",
  ski: "bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400",
  other: "bg-zinc-500/10 text-zinc-600 dark:bg-zinc-500/20 dark:text-zinc-400",
};

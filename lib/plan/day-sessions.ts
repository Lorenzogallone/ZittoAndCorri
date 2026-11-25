// Several sessions on the same day: order, time of day and link
// (a "chained" session is done right after the previous one, like a single
// outing split into two workouts on the watch). Pure functions.

import type { Translator } from "../../i18n/config.ts";
import type { DayPart } from "../types.ts";

/** "Mattina", "Pomeriggio", "Sera" (`t` bound to the "labels" namespace). */
export const dayPartLabel = (t: Translator, part: DayPart): string => t(`dayPart.${part}`);

export interface DaySession {
  date: string;
  day_order?: number | null;
  day_part?: DayPart | null;
  chained?: boolean | null;
}

const orderOf = (session: DaySession) => session.day_order ?? 1;

/** By date, then by position in the day; ties keep the given order. */
export function sortByDayOrder<T extends DaySession>(sessions: T[]): T[] {
  return sessions
    .map((session, index) => ({ session, index }))
    .sort((a, b) =>
      a.session.date.localeCompare(b.session.date)
      || orderOf(a.session) - orderOf(b.session)
      || a.index - b.index)
    .map(({ session }) => session);
}

/** Where the session sits in the day, for the UI; null if it is the only one. */
export function sessionPlacement(t: Translator, session: DaySession, sessionsThatDay: number): string | null {
  if (sessionsThatDay < 2) return null;
  if (session.chained && orderOf(session) > 1) return t("placement.afterPrevious");
  return session.day_part ? dayPartLabel(t, session.day_part) : null;
}

const PART_START: Record<DayPart, number> = { morning: 7 * 60, afternoon: 13 * 60, evening: 18 * 60 };

/**
 * Start time of the calendar event (Intervals.icu, watch): lines up the
 * day's sessions. A single session with no time of day stays at midnight.
 */
export function sessionStartTime(session: DaySession): string {
  const base = session.day_part ? PART_START[session.day_part] : 0;
  const minutes = base + orderOf(session) - 1;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}:00`;
}

/**
 * Normalizes the sessions proposed for a day: progressive order from `first`,
 * link only from the second session on and, for a chained session with no
 * time of day, the same time of day as the previous one (so it stays in line after it).
 */
export function numberDaySessions<T extends DaySession>(
  sessions: T[],
  first = 1,
  previousPart: DayPart | null = null,
): Array<T & { day_order: number; day_part: DayPart | null; chained: boolean }> {
  let part = previousPart;
  return sessions.map((session, index) => {
    const dayOrder = first + index;
    const chained = dayOrder > 1 && session.chained === true;
    part = session.day_part ?? (chained ? part : null);
    return { ...session, day_order: dayOrder, day_part: part, chained };
  });
}

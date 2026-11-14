// Più sedute nello stesso giorno: ordine, momento della giornata e legame
// (una seduta "concatenata" si fa subito dopo la precedente, come un'unica
// uscita divisa in due allenamenti sull'orologio). Funzioni pure.

import type { DayPart } from "../types.ts";

export const DAY_PART_LABELS: Record<DayPart, string> = {
  morning: "Mattina",
  afternoon: "Pomeriggio",
  evening: "Sera",
};

export interface DaySession {
  date: string;
  day_order?: number | null;
  day_part?: DayPart | null;
  chained?: boolean | null;
}

const orderOf = (session: DaySession) => session.day_order ?? 1;

/** Per data e poi per posizione nella giornata; a parità resta l'ordine dato. */
export function sortByDayOrder<T extends DaySession>(sessions: T[]): T[] {
  return sessions
    .map((session, index) => ({ session, index }))
    .sort((a, b) =>
      a.session.date.localeCompare(b.session.date)
      || orderOf(a.session) - orderOf(b.session)
      || a.index - b.index)
    .map(({ session }) => session);
}

/** Come si colloca la seduta nella giornata, per l'interfaccia; null se è l'unica. */
export function sessionPlacement(session: DaySession, sessionsThatDay: number): string | null {
  if (sessionsThatDay < 2) return null;
  if (session.chained && orderOf(session) > 1) return "Subito dopo la precedente";
  return session.day_part ? DAY_PART_LABELS[session.day_part] : null;
}

const PART_START: Record<DayPart, number> = { morning: 7 * 60, afternoon: 13 * 60, evening: 18 * 60 };

/**
 * Ora d'inizio dell'evento sul calendario (Intervals.icu, orologio): mette in
 * fila le sedute della giornata. Un'unica seduta senza momento resta a mezzanotte.
 */
export function sessionStartTime(session: DaySession): string {
  const base = session.day_part ? PART_START[session.day_part] : 0;
  const minutes = base + orderOf(session) - 1;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}:00`;
}

/**
 * Normalizza le sedute proposte per un giorno: ordine progressivo da `first`,
 * legame solo dalla seconda seduta in poi e, per una seduta concatenata senza
 * momento, lo stesso momento della precedente (così resta in fila dopo di lei).
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

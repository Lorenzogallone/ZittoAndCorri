// Ultimo errore di sincronizzazione Intervals.icu. Modulo puro: niente import
// runtime, testabile.
//
// Ci sono giri parziali: l'import orario non ripubblica il piano, la
// ripubblicazione dopo una modifica non importa. Un giro senza errori cancella
// solo gli errori della parte che ha eseguito davvero: l'import orario riuscito
// non nasconde un invio del piano fallito al mattino, e viceversa.

export const INTERVALS_ERROR_SEPARATOR = " · ";
const MAX_PARTS = 3;

/** Errori dell'import (corse e wellness): vedi lib/intervals/import.ts. */
export function isImportErrorPart(part: string): boolean {
  return part.startsWith("Wellness:") || part.startsWith("Attività");
}

export interface IntervalsRunOutcome {
  /** Il giro ha importato corse o wellness. */
  importRan: boolean;
  /** Il giro ha riallineato le zone e/o pubblicato il piano. */
  publishRan: boolean;
  /** Errori di questo giro, nell'ordine in cui sono avvenuti. */
  errors: string[];
}

/** Nuovo valore di last_error dopo un giro: null se non resta nulla da segnalare. */
export function nextIntervalsError(previous: string | null | undefined, run: IntervalsRunOutcome): string | null {
  const kept = (previous ?? "")
    .split(INTERVALS_ERROR_SEPARATOR)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => (isImportErrorPart(part) ? !run.importRan : !run.publishRan));
  const parts = [...new Set([...run.errors.map((part) => part.trim()).filter(Boolean), ...kept])];
  return parts.length ? parts.slice(0, MAX_PARTS).join(INTERVALS_ERROR_SEPARATOR) : null;
}

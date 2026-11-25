// Last Intervals.icu sync error. Pure module: no runtime
// imports, testable.
//
// There are partial rounds: the hourly import does not republish the plan, and
// republishing after an edit does not import. A round without errors clears
// only the errors of the part that actually ran: a successful hourly import
// does not hide a failed plan push from the morning, and vice versa.

export const INTERVALS_ERROR_SEPARATOR = " · ";
const MAX_PARTS = 3;

/** Import errors (runs and wellness): see lib/intervals/import.ts. */
export function isImportErrorPart(part: string): boolean {
  return part.startsWith("Wellness:") || part.startsWith("Attività");
}

export interface IntervalsRunOutcome {
  /** The round imported runs or wellness. */
  importRan: boolean;
  /** The round realigned zones and/or published the plan. */
  publishRan: boolean;
  /** Errors of this round, in the order they occurred. */
  errors: string[];
}

/** New value of last_error after a round: null if nothing is left to report. */
export function nextIntervalsError(previous: string | null | undefined, run: IntervalsRunOutcome): string | null {
  const kept = (previous ?? "")
    .split(INTERVALS_ERROR_SEPARATOR)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => (isImportErrorPart(part) ? !run.importRan : !run.publishRan));
  const parts = [...new Set([...run.errors.map((part) => part.trim()).filter(Boolean), ...kept])];
  return parts.length ? parts.slice(0, MAX_PARTS).join(INTERVALS_ERROR_SEPARATOR) : null;
}

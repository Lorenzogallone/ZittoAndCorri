// Date helpers shared by server pages (request-time). Keeping them here
// avoids direct impure calls in component bodies (react-hooks/purity).

/** Today in ISO format YYYY-MM-DD. */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** ISO date YYYY-MM-DD `days` days from today (negative = past). */
export function isoDaysFromNow(days: number): string {
  return new Date(Date.now() + days * 24 * 3600 * 1000).toISOString().slice(0, 10);
}

/** Current timestamp in ms (Date.now, but importable in pages). */
export function nowMs(): number {
  return Date.now();
}

/** Shifts an ISO date YYYY-MM-DD by `days` days (negative = backwards). */
export function isoDateShift(isoDate: string, days: number): string {
  return new Date(
    new Date(`${isoDate}T00:00:00Z`).getTime() + days * 24 * 3600 * 1000,
  )
    .toISOString()
    .slice(0, 10);
}

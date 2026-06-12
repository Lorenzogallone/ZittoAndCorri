// Helper di data condivisi per le pagine server (request-time). Tenerli qui
// evita chiamate impure dirette nel corpo dei componenti (react-hooks/purity).

/** Oggi in formato ISO YYYY-MM-DD. */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Data ISO YYYY-MM-DD a `days` giorni da oggi (negativo = passato). */
export function isoDaysFromNow(days: number): string {
  return new Date(Date.now() + days * 24 * 3600 * 1000).toISOString().slice(0, 10);
}

/** Timestamp corrente in ms (Date.now, ma importabile nelle pagine). */
export function nowMs(): number {
  return Date.now();
}

/** Sposta una data ISO YYYY-MM-DD di `days` giorni (negativo = indietro). */
export function isoDateShift(isoDate: string, days: number): string {
  return new Date(
    new Date(`${isoDate}T00:00:00Z`).getTime() + days * 24 * 3600 * 1000,
  )
    .toISOString()
    .slice(0, 10);
}

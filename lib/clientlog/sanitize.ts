// Regole lato server per /api/clientlog: quanto può essere grande un evento,
// quanti eventi accettare per utente e cosa finisce davvero nei log.
// Modulo puro (niente Next, niente Supabase) così i test lo importano diretto.

export const CLIENTLOG_MAX_BODY_BYTES = 8 * 1024;
export const CLIENTLOG_MAX_LINE_CHARS = 2000;
const MAX_FIELD_CHARS = 200;

export const CLIENTLOG_RATE_LIMIT = 60;
export const CLIENTLOG_RATE_WINDOW_MS = 60_000;

function clip(value: unknown, max: number): string | null {
  if (value == null) return null;
  const text = typeof value === "string" ? value : String(value);
  // Niente a capo: una riga per evento, non si possono fingere altre righe di log.
  const flat = text.replace(/[\r\n\u2028\u2029]+/g, " ");
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

/**
 * Trasforma il corpo ricevuto in una riga di log sicura: tiene solo i campi
 * noti, tronca ogni campo e la riga intera. Null se il corpo non è un evento.
 */
export function sanitizeClientLog(body: string, userId: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  const ev = clip(record.ev, 80);
  if (!ev) return null;

  let data: string | null = null;
  try {
    data = record.data == null ? null : JSON.stringify(record.data);
  } catch {
    data = null;
  }

  const line = JSON.stringify({
    user: userId,
    ev,
    url: clip(record.url, MAX_FIELD_CHARS),
    standalone: record.standalone === true,
    ts: clip(record.ts, 40),
    data: clip(data, CLIENTLOG_MAX_LINE_CHARS),
  });
  return line.length > CLIENTLOG_MAX_LINE_CHARS
    ? `${line.slice(0, CLIENTLOG_MAX_LINE_CHARS)}…`
    : line;
}

interface Bucket { count: number; resetAt: number }

/**
 * Limite a finestra fissa per chiave (qui l'id utente, che arriva dalla
 * sessione e non dal client). Vale per singola istanza della funzione: basta
 * a fermare un client impazzito, non è un limite globale.
 */
export function createRateLimiter(limit = CLIENTLOG_RATE_LIMIT, windowMs = CLIENTLOG_RATE_WINDOW_MS) {
  const buckets = new Map<string, Bucket>();
  return function allow(key: string, now = Date.now()): boolean {
    const current = buckets.get(key);
    if (!current || current.resetAt <= now) {
      if (buckets.size > 1000) {
        for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
      }
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    if (current.count >= limit) return false;
    current.count += 1;
    return true;
  };
}

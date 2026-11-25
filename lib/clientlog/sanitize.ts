// Server-side rules for /api/clientlog: how big an event can be,
// how many events to accept per user and what actually ends up in the logs.
// Pure module (no Next, no Supabase) so tests import it directly.

export const CLIENTLOG_MAX_BODY_BYTES = 8 * 1024;
export const CLIENTLOG_MAX_LINE_CHARS = 2000;
const MAX_FIELD_CHARS = 200;

export const CLIENTLOG_RATE_LIMIT = 60;
export const CLIENTLOG_RATE_WINDOW_MS = 60_000;

function clip(value: unknown, max: number): string | null {
  if (value == null) return null;
  const text = typeof value === "string" ? value : String(value);
  // No newlines: one line per event, other log lines cannot be faked.
  const flat = text.replace(/[\r\n\u2028\u2029]+/g, " ");
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

/**
 * Turns the received body into a safe log line: keeps only known
 * fields, truncates each field and the whole line. Null if the body is not an event.
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
 * Fixed-window limit per key (here the user id, which comes from the
 * session and not from the client). Applies per function instance: enough
 * to stop a runaway client, it is not a global limit.
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

import "server-only";

export const ZEPP_MAX_BODY_BYTES = 256 * 1024;

export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : null;
}

export async function readJsonWithLimit(request: Request, maxBytes: number): Promise<unknown> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > maxBytes) throw new Error("PAYLOAD_TOO_LARGE");
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw new Error("PAYLOAD_TOO_LARGE");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("INVALID_JSON");
  }
}

interface AttemptState { count: number; resetAt: number }
const pairingAttempts = new Map<string, AttemptState>();

/** Limite best-effort per processo; il codice monouso scade comunque dopo 10 minuti. */
export function consumePairingAttempt(key: string, now = Date.now()): boolean {
  const current = pairingAttempts.get(key);
  if (!current || current.resetAt <= now) {
    pairingAttempts.set(key, { count: 1, resetAt: now + 10 * 60_000 });
    return true;
  }
  if (current.count >= 5) return false;
  current.count += 1;
  return true;
}

export function clearPairingAttempts(key: string): void {
  pairingAttempts.delete(key);
}

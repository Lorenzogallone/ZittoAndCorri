import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

const digest = (value: string) => createHash("sha256").update(value).digest();

/**
 * Autorizza le route cron con `Authorization: Bearer ${CRON_SECRET}`.
 * Ritorna la risposta d'errore da restituire, oppure null se autorizzato.
 */
export function cronAuthError(request: Request): Response | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "CRON_SECRET non configurato." }, { status: 503 });
  const header = request.headers.get("authorization") ?? "";
  if (!timingSafeEqual(digest(header), digest(`Bearer ${secret}`))) {
    return Response.json({ error: "Non autorizzato." }, { status: 401 });
  }
  return null;
}

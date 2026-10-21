// "Nuova chat": un messaggio di stato segna l'inizio di una conversazione
// pulita. Il coach vede solo i messaggi dopo l'ultimo segno (piano, corse e
// memorie restano); la chat mostra la conversazione corrente e, a richiesta,
// quelle precedenti. Modulo puro, usato da server e client.

export const NEW_SESSION = "new_session";

interface SessionMessage {
  kind: string;
  metadata?: Record<string, unknown> | null;
}

export const isSessionMarker = (message: SessionMessage) =>
  message.kind === "status" && message.metadata?.type === NEW_SESSION;

/**
 * Messaggi della conversazione corrente da una lista dal più recente al più
 * vecchio (come la legge il coach): si ferma al primo segno di nuova chat e
 * scarta gli altri messaggi di stato. Restituisce anche quando è iniziata.
 */
export function currentSession<T extends SessionMessage & { created_at: string }>(newestFirst: T[]): { messages: T[]; startedAt: string | null } {
  const messages: T[] = [];
  for (const message of newestFirst) {
    if (isSessionMarker(message)) return { messages, startedAt: message.created_at };
    if (message.kind !== "status") messages.push(message);
  }
  return { messages, startedAt: null };
}

/**
 * Per la chat (dal più vecchio al più recente): la conversazione corrente e
 * quanti messaggi veri ci sono prima, nascosti finché non si chiede di vederli.
 */
export function splitSessions<T extends SessionMessage>(oldestFirst: T[]): { current: T[]; earlier: number } {
  let start = -1;
  oldestFirst.forEach((message, index) => {
    if (isSessionMarker(message)) start = index;
  });
  const current = oldestFirst.slice(start + 1).filter((message) => message.kind !== "status");
  const earlier = oldestFirst.slice(0, Math.max(0, start)).filter((message) => message.kind !== "status").length;
  return { current, earlier };
}

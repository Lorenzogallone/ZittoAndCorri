// "New chat": a status message marks the start of a clean
// conversation. The coach sees only the messages after the last mark (plan, runs and
// memories stay); the chat shows the current conversation and, on request,
// the previous ones. Pure module, used by server and client.

export const NEW_SESSION = "new_session";

interface SessionMessage {
  kind: string;
  metadata?: Record<string, unknown> | null;
}

export const isSessionMarker = (message: SessionMessage) =>
  message.kind === "status" && message.metadata?.type === NEW_SESSION;

/**
    * Messages of the current conversation from a list ordered newest to
    * oldest (as the coach reads it): stops at the first new-chat mark and
    * discards other status messages. Also returns when it started.
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
    * For the chat (oldest to newest): the current conversation and
    * how many real messages come before it, hidden until asked to show them.
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

// Messaggi dell'atleta rimasti senza risposta del coach. Lo stato vive in
// coach_messages.metadata.send_error (nessuna migrazione): lo scrive il server
// quando il turno fallisce, lo toglie "Riprova". Un messaggio senza risposta e
// senza segno (funzione interrotta, dati vecchi) si riconosce dalla sequenza.
// Modulo puro: lo usano chat, contesto AI e test.

export const SEND_ERROR_KEY = "send_error";

/** Oltre questo tempo un messaggio senza risposta non è più "in corso". */
export const UNANSWERED_AFTER_MS = 6 * 60_000;

export interface SendError {
  message: string;
  at: string;
}

interface MessageLike {
  id: string;
  role: string;
  kind: string;
  content?: string;
  created_at: string;
  metadata?: Record<string, unknown> | null;
}

export function sendErrorOf(message: Pick<MessageLike, "metadata">): SendError | null {
  const raw = message.metadata?.[SEND_ERROR_KEY];
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  return {
    message: typeof value.message === "string" && value.message ? value.message : "Il coach non ha risposto.",
    at: typeof value.at === "string" ? value.at : "",
  };
}

/** Domanda della chat (non commenti automatici, proposte o segni di sessione). */
const isQuestion = (message: MessageLike) => message.role === "user" && message.kind === "chat";
/** Una risposta del coach alla chat; i commenti alle corse non contano. */
const isReply = (message: MessageLike) => message.role === "assistant" && (message.kind === "chat" || message.kind === "plan_proposal");

/**
 * Id dei messaggi dell'atleta falliti: con send_error, oppure senza risposta
 * (né `reply_to` né una risposta subito dopo) e più vecchi di `UNANSWERED_AFTER_MS`.
 * `messages` in qualsiasi ordine.
 */
export function failedMessageIds(messages: MessageLike[], now: number): Set<string> {
  const sorted = [...messages].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const answered = new Set(sorted.flatMap((m) => {
    const replyTo = m.metadata?.reply_to;
    return isReply(m) && typeof replyTo === "string" ? [replyTo] : [];
  }));
  const failed = new Set<string>();
  sorted.forEach((message, index) => {
    if (!isQuestion(message) || answered.has(message.id)) return;
    if (sendErrorOf(message)) {
      failed.add(message.id);
      return;
    }
    const next = sorted.slice(index + 1).find((m) => m.kind !== "activity_feedback" && m.kind !== "status");
    if (next && isReply(next) && typeof next.metadata?.reply_to !== "string") return; // risposta vecchia senza reply_to
    const created = Date.parse(message.created_at);
    if (Number.isFinite(created) && now - created > UNANSWERED_AFTER_MS) failed.add(message.id);
  });
  return failed;
}

/** Storia per il modello senza le domande rimaste senza risposta. */
export function withoutFailedMessages<M extends MessageLike>(messages: M[], now: number): M[] {
  const failed = failedMessageIds(messages, now);
  return failed.size ? messages.filter((message) => !failed.has(message.id)) : messages;
}

/** Metadati con l'errore di invio, o senza quando si riprova. */
export function markSendError(metadata: Record<string, unknown> | null | undefined, error: SendError | null): Record<string, unknown> {
  const rest = { ...(metadata ?? {}) };
  delete rest[SEND_ERROR_KEY];
  return error ? { ...rest, [SEND_ERROR_KEY]: error } : rest;
}

/**
 * Messaggi per la chat: alle domande rimaste senza risposta e senza segno
 * (funzione interrotta, dati vecchi) aggiunge send_error, solo in memoria.
 */
export function withFailureMarks<M extends MessageLike>(messages: M[], now = Date.now()): M[] {
  const failed = failedMessageIds(messages, now);
  if (!failed.size) return messages;
  return messages.map((message) => failed.has(message.id) && !sendErrorOf(message)
    ? { ...message, metadata: markSendError(message.metadata, { message: "Il coach non ha risposto a questo messaggio.", at: "" }) }
    : message);
}

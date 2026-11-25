// Athlete messages left without a coach reply. The state lives in
// coach_messages.metadata.send_error (no migration): the server writes it
// when the turn fails, "Retry" removes it. A message with no reply and
// no flag (interrupted function, old data) is recognized from the sequence.
// Pure module: used by chat, AI context and tests.

export const SEND_ERROR_KEY = "send_error";

/** Beyond this time a message without a reply is no longer "in progress". */
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

/** Chat question (not automatic comments, proposals or session flags). */
const isQuestion = (message: MessageLike) => message.role === "user" && message.kind === "chat";
/** A coach reply to the chat; run comments don't count. */
const isReply = (message: MessageLike) => message.role === "assistant" && (message.kind === "chat" || message.kind === "plan_proposal");

/**
 * Ids of the failed athlete messages: with send_error, or without a reply
 * (neither `reply_to` nor a reply right after) and older than `UNANSWERED_AFTER_MS`.
 * `messages` in any order.
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
    if (next && isReply(next) && typeof next.metadata?.reply_to !== "string") return; // old reply without reply_to
    const created = Date.parse(message.created_at);
    if (Number.isFinite(created) && now - created > UNANSWERED_AFTER_MS) failed.add(message.id);
  });
  return failed;
}

/** History for the model without the questions left unanswered. */
export function withoutFailedMessages<M extends MessageLike>(messages: M[], now: number): M[] {
  const failed = failedMessageIds(messages, now);
  return failed.size ? messages.filter((message) => !failed.has(message.id)) : messages;
}

/** Metadata with the send error, or without it when retrying. */
export function markSendError(metadata: Record<string, unknown> | null | undefined, error: SendError | null): Record<string, unknown> {
  const rest = { ...(metadata ?? {}) };
  delete rest[SEND_ERROR_KEY];
  return error ? { ...rest, [SEND_ERROR_KEY]: error } : rest;
}

/**
 * Messages for the chat: adds send_error, in memory only, to the questions left
 * unanswered and without a flag (interrupted function, old data).
 */
export function withFailureMarks<M extends MessageLike>(messages: M[], now = Date.now()): M[] {
  const failed = failedMessageIds(messages, now);
  if (!failed.size) return messages;
  return messages.map((message) => failed.has(message.id) && !sendErrorOf(message)
    ? { ...message, metadata: markSendError(message.metadata, { message: "Il coach non ha risposto a questo messaggio.", at: "" }) }
    : message);
}

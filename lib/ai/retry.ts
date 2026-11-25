// Retry of an AI call when the response is invalid (unreadable JSON or
// structure) or the provider has a transient error. Pure module:
// used by lib/ai/llm.ts and tested in tests/coach-reliability.test.ts.

/** Attempts in total, including the first: a single retry. */
export const AI_MAX_ATTEMPTS = 2;
/** A retry starts only if at least this much time remains before the deadline. */
export const AI_MIN_RETRY_MS = 45_000;

/** Response arrived but unusable: broken JSON or wrong structure. */
export class InvalidAiResponseError extends Error {
  /** Tokens and cost of the discarded response (you pay anyway). */
  readonly usage?: unknown;
  constructor(message: string, usage?: unknown) {
    super(message);
    this.name = "InvalidAiResponseError";
    this.usage = usage;
  }
}

const statusOf = (error: unknown): number | null => {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" ? status : null;
};

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error ?? ""));

/** Unreadable JSON or object that fails validation (zod). */
export function isInvalidResponse(error: unknown): boolean {
  if (error instanceof InvalidAiResponseError || error instanceof SyntaxError) return true;
  const name = (error as { name?: unknown } | null)?.name;
  if (name === "ZodError") return true;
  // OpenRouter: 422 = response not in JSON format (lib/ai/openrouter.ts).
  return name === "OpenRouterError" && statusOf(error) === 422;
}

/**
 * Transient provider error: overload, 5xx, network. Never key, credit,
 * model or quota (retrying is pointless) nor timeout (no margin left).
 */
export function isTransientAiError(error: unknown): boolean {
  const name = (error as { name?: unknown } | null)?.name;
  if (name === "AiTimeoutError" || name === "TimeoutError" || name === "AbortError") return false;
  const status = statusOf(error);
  if (status === 504) return false;
  if (status != null && [400, 401, 402, 403, 404, 413].includes(status)) return false;
  const message = messageOf(error);
  if (/RESOURCE_EXHAUSTED|quota|free.?tier|requests.?per.?day/i.test(message)) return false;
  if (status != null && (status === 408 || status === 429 || status >= 500)) return true;
  return /\b(500|502|503)\b|UNAVAILABLE|overloaded|INTERNAL|fetch failed|ECONNRESET|ETIMEDOUT|socket hang up|Risposta (AI )?vuota/i.test(message);
}

export function shouldRetryAi(error: unknown): boolean {
  return isInvalidResponse(error) || isTransientAiError(error);
}

export interface RetryOptions {
  maxAttempts?: number;
  /** Instant (ms) after which no retry is made. */
  deadlineAt?: number;
  minRetryMs?: number;
  /** Other attempts already made inside the client (e.g. OpenRouter retries 5xx by itself). */
  retryable?: (error: unknown) => boolean;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** Called after each failed attempt, even the last. */
  onFailure?: (error: unknown, attempt: number) => void | Promise<void>;
}

/**
 * Runs `run` up to `maxAttempts` times. Stops immediately on a non-
 * recoverable error or if there is no time left for a real attempt.
 */
export async function withAiRetry<T>(run: (attempt: number) => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? AI_MAX_ATTEMPTS);
  const now = options.now ?? Date.now;
  const minRetryMs = options.minRetryMs ?? AI_MIN_RETRY_MS;
  const retryable = options.retryable ?? shouldRetryAi;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await run(attempt);
    } catch (error) {
      lastError = error;
      await options.onFailure?.(error, attempt);
      if (attempt >= maxAttempts || !retryable(error)) break;
      const pause = isInvalidResponse(error) ? 0 : 1_000 * attempt;
      if (options.deadlineAt != null && options.deadlineAt - now() - pause < minRetryMs) break;
      if (pause) await sleep(pause);
    }
  }
  throw lastError;
}

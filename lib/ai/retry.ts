// Nuovo tentativo di una chiamata AI quando la risposta non è valida (JSON o
// struttura non leggibile) o il provider ha un errore passeggero. Modulo puro:
// lo usa lib/ai/llm.ts e si prova in tests/coach-reliability.test.ts.

/** Tentativi in tutto, compreso il primo: un solo nuovo tentativo. */
export const AI_MAX_ATTEMPTS = 2;
/** Un nuovo tentativo parte solo se resta almeno questo tempo prima della scadenza. */
export const AI_MIN_RETRY_MS = 45_000;

/** Risposta arrivata ma non utilizzabile: JSON rotto o struttura sbagliata. */
export class InvalidAiResponseError extends Error {
  /** Token e costo della risposta scartata (si paga comunque). */
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

/** JSON non leggibile o oggetto che non passa la validazione (zod). */
export function isInvalidResponse(error: unknown): boolean {
  if (error instanceof InvalidAiResponseError || error instanceof SyntaxError) return true;
  const name = (error as { name?: unknown } | null)?.name;
  if (name === "ZodError") return true;
  // OpenRouter: 422 = risposta non in formato JSON (lib/ai/openrouter.ts).
  return name === "OpenRouterError" && statusOf(error) === 422;
}

/**
 * Errore passeggero del provider: sovraccarico, 5xx, rete. Mai chiave, credito,
 * modello o quota (ritentare non serve) né tempo scaduto (non c'è margine).
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
  /** Istante (ms) oltre cui non si riprova. */
  deadlineAt?: number;
  minRetryMs?: number;
  /** Altri tentativi già fatti dentro il client (es. OpenRouter riprova da sé i 5xx). */
  retryable?: (error: unknown) => boolean;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** Chiamato dopo ogni tentativo fallito, anche l'ultimo. */
  onFailure?: (error: unknown, attempt: number) => void | Promise<void>;
}

/**
 * Esegue `run` fino a `maxAttempts` volte. Smette subito con un errore non
 * recuperabile o se manca il tempo per un tentativo vero.
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

// Server-only Gemini client + structured output helper. PLAN.md §8.
// The LLM produces only qualitative text / structure: the ground-truth numbers stay
// in lib/metrics (principle §2.1). The key never touches the client.
import "server-only";
import { GoogleGenAI, type GenerateContentResponseUsageMetadata, type Schema } from "@google/genai";
import { DEFAULT_GEMINI_MODEL, geminiPrice } from "@/lib/ai/models";
import { geminiUsage, type AiUsage } from "@/lib/ai/usage";
import { InvalidAiResponseError } from "@/lib/ai/retry";
import { promptText, type Prompt } from "@/lib/ai/prompt-cache";

export const PRIMARY_MODEL = DEFAULT_GEMINI_MODEL;
const FALLBACK_MODEL = "gemini-2.5-flash-lite";
const MAX_RETRIES = 3;

// Overall budget of the AI call. It MUST stay under the `maxDuration`
// of the route that invokes the server action (see `export const maxDuration` in
// app/page.tsx, app/activities/[id]/page.tsx and in the import routes): if the function exceeded
// that limit, the platform kills it and the server action's POST returns an
// invalid response → Next forces a full reload, which in a standalone PWA
// looks like a "crash" that returns to the initial splash. With this deadline the
// call fails cleanly (error state shown in the UI) and the PWA never
// reloads. */
const DEADLINE_MS = 180_000;

class AiTimeoutError extends Error {
  constructor() {
    super("AI deadline exceeded");
    this.name = "AiTimeoutError";
  }
}

/**
 * User message key (namespace "status", ai.<key>) for an error
 * of the AI pipeline. Distinguishes the internal timeout (deadline exceeded) from the real
 * Gemini rate limit: before, we showed "check the Gemini quota" for any
 * error, confusing the user when the quota was actually fine and the
 * problem was just slowness.
 */
export function geminiErrorKey(err: unknown): "geminiTimeout" | "geminiQuota" | "failed" {
  if (err instanceof AiTimeoutError) return "geminiTimeout";
  if (isRateLimit(err)) return "geminiQuota";
  return "failed";
}

function getClient(apiKey: string): GoogleGenAI {
  if (!apiKey.trim()) throw new Error("Chiave Gemini personale non configurata");
  return new GoogleGenAI({ apiKey });
}

/** Checks the credential without generating content. */
export async function verifyGeminiApiKey(apiKey: string, model = PRIMARY_MODEL): Promise<void> {
  await getClient(apiKey).models.get({ model });
}

/** True if the error is a free-tier rate limit (per minute/day). */
function isRateLimit(err: unknown): boolean {
  const status = (err as { status?: number } | null)?.status;
  if (status === 429) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return /\b429\b|RESOURCE_EXHAUSTED|rate.?limit/i.test(msg);
}

/** Project/free-tier quota exhausted: retrying right away wastes calls. */
function isQuotaExhausted(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /RESOURCE_EXHAUSTED|quota|free.?tier|requests.?per.?day/i.test(msg);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function callModel(
  apiKey: string,
  model: string,
  prompt: string,
  schema: Schema,
): Promise<{ text: string; usage: GenerateContentResponseUsageMetadata | undefined }> {
  const res = await getClient(apiKey).models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: schema,
    },
  });
  const text = res.text;
  if (!text) throw new Error("Risposta AI vuota");
  return { text, usage: res.usageMetadata };
}

/** Response JSON with tokens and cost estimated from the price list. */
function result<T>(model: string, reply: { text: string; usage: GenerateContentResponseUsageMetadata | undefined }) {
  const usage = geminiUsage(model, reply.usage, geminiPrice(model));
  try {
    return { data: JSON.parse(reply.text) as T, usage };
  } catch {
    // Paid but unreadable response: lib/ai/llm.ts retries it and records its cost.
    throw new InvalidAiResponseError("Risposta AI non in formato JSON", usage);
  }
}

/** Races `p` against an absolute deadline: if it expires, rejects with AiTimeoutError
 *  (the underlying fetch may continue, but the server action has already returned). */
function withDeadline<T>(p: Promise<T>, deadlineAt: number): Promise<T> {
  const remaining = deadlineAt - Date.now();
  if (remaining <= 0) return Promise.reject(new AiTimeoutError());
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new AiTimeoutError()), remaining);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * Generates a structured object `T` validated by Gemini's native `responseSchema`,
 * with the tokens used and the estimated cost. Retry with exponential backoff on 429; as a last resort falls back
 * to the lite model. Non-quota errors are rethrown immediately. The whole
 * operation is bounded by DEADLINE_MS: past that time it returns AiTimeoutError
 * instead of risking the function being killed (see the note on DEADLINE_MS).
 */
export async function generateStructured<T>(
  /** With parts, the fixed prefix goes first: Gemini caches it on its own. */
  input: Prompt,
  schema: Schema,
  opts: { apiKey: string; model?: string; /** Instant (ms) by which to finish; default 3 minutes from now. */ deadlineAt?: number },
): Promise<{ data: T; usage: AiUsage }> {
  const prompt = promptText(input);
  const model = opts?.model ?? PRIMARY_MODEL;
  const deadlineAt = opts.deadlineAt ?? Date.now() + DEADLINE_MS;
  let lastErr: unknown;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (Date.now() >= deadlineAt) break;
    try {
      return result<T>(model, await withDeadline(callModel(opts.apiKey, model, prompt, schema), deadlineAt));
    } catch (err) {
      lastErr = err;
      if (err instanceof AiTimeoutError) throw err;
      if (!isRateLimit(err)) throw err;
      // An exhausted quota cannot recover with a retry a few seconds apart
      // nor by switching to the lite model: end the job at the first error.
      if (isQuotaExhausted(err)) throw err;
      // Do not sleep past the deadline.
      const backoff = 500 * 2 ** attempt; // 0.5s, 1s, 2s
      if (Date.now() + backoff >= deadlineAt) break;
      await sleep(backoff);
    }
  }

  // If the user explicitly chose a model, respect the choice even
  // on error: they can switch to an endpoint with a different quota from settings.
  if (opts.model) throw lastErr ?? new Error("Richiesta AI non riuscita");

  // Historical fallback only for calls that do not specify any model.
  try {
    return result<T>(FALLBACK_MODEL, await withDeadline(callModel(opts.apiKey, FALLBACK_MODEL, prompt, schema), deadlineAt));
  } catch (err) {
    throw lastErr ?? err;
  }
}

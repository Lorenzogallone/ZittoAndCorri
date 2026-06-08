// Client Gemini server-only + helper output strutturato. PLAN.md §8.
// L'LLM produce solo testo qualitativo / struttura: i numeri di verità restano
// in lib/metrics (principio §2.1). La chiave non tocca mai il client.
import "server-only";
import { GoogleGenAI, type Schema } from "@google/genai";

export const PRIMARY_MODEL = "gemini-2.5-flash";
const FALLBACK_MODEL = "gemini-2.5-flash-lite";
const MAX_RETRIES = 3;

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY non configurata");
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}

/** True se l'errore è un rate-limit del free tier (per minuto/giorno). */
function isRateLimit(err: unknown): boolean {
  const status = (err as { status?: number } | null)?.status;
  if (status === 429) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return /\b429\b|RESOURCE_EXHAUSTED|rate.?limit/i.test(msg);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function callModel(
  model: string,
  prompt: string,
  schema: Schema,
): Promise<string> {
  const res = await getClient().models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: schema,
    },
  });
  const text = res.text;
  if (!text) throw new Error("Risposta AI vuota");
  return text;
}

/**
 * Genera un oggetto strutturato `T` validato dal `responseSchema` nativo di
 * Gemini. Retry con backoff esponenziale sui 429; come ultima spiaggia ripiega
 * sul modello lite. Gli errori non-quota vengono rilanciati subito.
 */
export async function generateStructured<T>(
  prompt: string,
  schema: Schema,
  opts?: { model?: string },
): Promise<T> {
  const model = opts?.model ?? PRIMARY_MODEL;
  let lastErr: unknown;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return JSON.parse(await callModel(model, prompt, schema)) as T;
    } catch (err) {
      lastErr = err;
      if (!isRateLimit(err)) throw err;
      await sleep(500 * 2 ** attempt); // 0.5s, 1s, 2s
    }
  }

  // Fallback al modello con limiti diversi prima di arrendersi.
  try {
    return JSON.parse(await callModel(FALLBACK_MODEL, prompt, schema)) as T;
  } catch {
    throw lastErr;
  }
}

// Client Gemini server-only + helper output strutturato. PLAN.md §8.
// L'LLM produce solo testo qualitativo / struttura: i numeri di verità restano
// in lib/metrics (principio §2.1). La chiave non tocca mai il client.
import "server-only";
import { GoogleGenAI, type Schema } from "@google/genai";
import { DEFAULT_GEMINI_MODEL } from "@/lib/ai/models";

export const PRIMARY_MODEL = DEFAULT_GEMINI_MODEL;
const FALLBACK_MODEL = "gemini-2.5-flash-lite";
const MAX_RETRIES = 3;

// Budget complessivo della chiamata AI. DEVE restare sotto il `maxDuration`
// della route che invoca la server action (vedi `export const maxDuration` in
// app/page.tsx, app/activities/[id]/page.tsx e nelle route di import): se la funzione superasse
// quel limite, la piattaforma la killa e la POST della server action torna una
// risposta non valida → Next forza un reload completo, che in PWA standalone si
// vede come un "crash" che riporta allo splash iniziale. Con questo deadline la
// chiamata fallisce in modo pulito (stato d'errore mostrato in UI) e la PWA non
// si ricarica mai. */
const DEADLINE_MS = 180_000;

class AiTimeoutError extends Error {
  constructor() {
    super("AI deadline exceeded");
    this.name = "AiTimeoutError";
  }
}

/**
 * Messaggio utente corretto per un errore della pipeline AI. Distingue il
 * timeout interno (deadline superato) dal vero rate-limit Gemini: prima
 * mostravamo "controlla la quota Gemini" per qualsiasi errore, confondendo
 * l'utente quando la quota era in realtà a posto e il problema era solo lentezza.
 */
export function aiErrorMessage(err: unknown): string {
  if (err instanceof AiTimeoutError) {
    return "L'AI ci sta mettendo troppo e la richiesta è scaduta. Riprova tra poco.";
  }
  if (isRateLimit(err)) {
    // Solo caratteri ASCII: il messaggio attraversa una Server Action/RSC e
    // resta leggibile anche nei client che interpretano male il charset.
    return "Quota del modello Gemini esaurita. Scegli un altro modello nelle impostazioni oppure attendi il ripristino.";
  }
  return "Richiesta AI non riuscita. Riprova tra poco.";
}

function getClient(apiKey: string): GoogleGenAI {
  if (!apiKey.trim()) throw new Error("Chiave Gemini personale non configurata");
  return new GoogleGenAI({ apiKey });
}

/** Verifica la credenziale senza generare contenuto. */
export async function verifyGeminiApiKey(apiKey: string, model = PRIMARY_MODEL): Promise<void> {
  await getClient(apiKey).models.get({ model });
}

/** True se l'errore è un rate-limit del free tier (per minuto/giorno). */
function isRateLimit(err: unknown): boolean {
  const status = (err as { status?: number } | null)?.status;
  if (status === 429) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return /\b429\b|RESOURCE_EXHAUSTED|rate.?limit/i.test(msg);
}

/** Quota del progetto/free tier esaurita: ritentare subito spreca chiamate. */
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
): Promise<string> {
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
  return text;
}

/** Corre `p` contro un deadline assoluto: se scade, rigetta con AiTimeoutError
 *  (la fetch sottostante può continuare, ma la server action è già tornata). */
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
 * Genera un oggetto strutturato `T` validato dal `responseSchema` nativo di
 * Gemini. Retry con backoff esponenziale sui 429; come ultima spiaggia ripiega
 * sul modello lite. Gli errori non-quota vengono rilanciati subito. L'intera
 * operazione è limitata da DEADLINE_MS: oltre quel tempo torna AiTimeoutError
 * invece di rischiare il kill della funzione (vedi nota su DEADLINE_MS).
 */
export async function generateStructured<T>(
  prompt: string,
  schema: Schema,
  opts: { apiKey: string; model?: string },
): Promise<T> {
  const model = opts?.model ?? PRIMARY_MODEL;
  const deadlineAt = Date.now() + DEADLINE_MS;
  let lastErr: unknown;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (Date.now() >= deadlineAt) break;
    try {
      const text = await withDeadline(callModel(opts.apiKey, model, prompt, schema), deadlineAt);
      return JSON.parse(text) as T;
    } catch (err) {
      lastErr = err;
      if (err instanceof AiTimeoutError) throw err;
      if (!isRateLimit(err)) throw err;
      // Una quota esaurita non può recuperare con retry a distanza di pochi
      // secondi né passando al modello lite: termina il job al primo errore.
      if (isQuotaExhausted(err)) throw err;
      // Non dormire oltre il deadline.
      const backoff = 500 * 2 ** attempt; // 0.5s, 1s, 2s
      if (Date.now() + backoff >= deadlineAt) break;
      await sleep(backoff);
    }
  }

  // Se l'utente ha scelto esplicitamente un modello, rispetta la scelta anche
  // in errore: potrà passare a un endpoint con quota diversa dalle impostazioni.
  if (opts.model) throw lastErr ?? new Error("Richiesta AI non riuscita");

  // Fallback storico solo per chiamate che non specificano alcun modello.
  try {
    return JSON.parse(
      await withDeadline(callModel(opts.apiKey, FALLBACK_MODEL, prompt, schema), deadlineAt),
    ) as T;
  } catch (err) {
    throw lastErr ?? err;
  }
}

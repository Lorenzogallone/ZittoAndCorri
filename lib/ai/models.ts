/**
 * Modelli testuali con quota gratuita positiva, ordinati per potenza stimata.
 * I limiti sono quelli mostrati da Google AI Studio per il progetto dell'utente
 * ad agosto 2026 e servono come indicazione: Google può modificarli.
 *
 * `price`: listino a pagamento in dollari per milione di token (input, output
 * compreso il ragionamento, input in cache), da fonti pubbliche di ottobre
 * 2026. Serve a stimare il costo di ogni risposta: con il piano gratuito di
 * Gemini non si paga nulla.
 */
export const GEMINI_MODELS = [
  { id: "gemini-3.7-flash", label: "Gemini 3.7 Flash", rpm: 5, rpd: 20, price: { input: 0.75, output: 3.75, cached: 0.075 } },
  { id: "gemini-3.6-flash", label: "Gemini 3.6 Flash", rpm: 5, rpd: 20, price: { input: 0.75, output: 3.75, cached: 0.075 } },
  { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash", rpm: 5, rpd: 20, price: { input: 1.5, output: 9, cached: 0.15 } },
  { id: "gemini-3-flash-preview", label: "Gemini 3 Flash (preview)", rpm: 5, rpd: 20, price: { input: 0.5, output: 3, cached: 0.05 } },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", rpm: 5, rpd: 20, price: { input: 0.3, output: 2.5, cached: 0.03 } },
  { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash Lite", rpm: 15, rpd: 500, price: { input: 0.3, output: 2.5, cached: 0.03 } },
  { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite", rpm: 15, rpd: 500, price: { input: 0.25, output: 1.5, cached: 0.025 } },
  { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite", rpm: 10, rpd: 20, price: { input: 0.1, output: 0.4, cached: 0.01 } },
] as const;

export type GeminiModelId = (typeof GEMINI_MODELS)[number]["id"];

/** Il miglior compromesso per usare quotidianamente il free tier. */
export const DEFAULT_GEMINI_MODEL: GeminiModelId = "gemini-3.5-flash-lite";

export function isGeminiModelId(value: unknown): value is GeminiModelId {
  return typeof value === "string" && GEMINI_MODELS.some((model) => model.id === value);
}

export function normalizeGeminiModel(value: unknown): GeminiModelId {
  return isGeminiModelId(value) ? value : DEFAULT_GEMINI_MODEL;
}

export function geminiPrice(model: string): { input: number; output: number; cached: number } | null {
  return GEMINI_MODELS.find((m) => m.id === model)?.price ?? null;
}

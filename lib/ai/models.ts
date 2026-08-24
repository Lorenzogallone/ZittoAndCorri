/**
 * Modelli testuali con quota gratuita positiva, ordinati per potenza stimata.
 * I limiti sono quelli mostrati da Google AI Studio per il progetto dell'utente
 * ad agosto 2026 e servono come indicazione: Google può modificarli.
 */
export const GEMINI_MODELS = [
  { id: "gemini-3.7-flash", label: "Gemini 3.7 Flash", rpm: 5, rpd: 20 },
  { id: "gemini-3.6-flash", label: "Gemini 3.6 Flash", rpm: 5, rpd: 20 },
  { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash", rpm: 5, rpd: 20 },
  { id: "gemini-3-flash-preview", label: "Gemini 3 Flash (preview)", rpm: 5, rpd: 20 },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", rpm: 5, rpd: 20 },
  { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash Lite", rpm: 15, rpd: 500 },
  { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite", rpm: 15, rpd: 500 },
  { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite", rpm: 10, rpd: 20 },
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


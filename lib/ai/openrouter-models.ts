// Catalogo OpenRouter per il selettore dei modelli: raggruppato per azienda
// (Anthropic, OpenAI, Google…), con prezzi leggibili. Modulo puro, lo usa
// anche il client.

export interface OpenRouterModel {
  id: string;
  name: string;
  /** Prezzo in dollari per milione di token (input, output); 0 = gratis. */
  prompt_per_m: number | null;
  completion_per_m: number | null;
  context: number | null;
  /** Data di uscita (secondi unix), per suggerire i modelli più recenti. */
  created: number | null;
}

/** "Anthropic: Claude Sonnet 5.5" → "Anthropic"; senza prefisso usa l'id ("x-ai/…" → "x-ai"). */
export function providerOf(model: Pick<OpenRouterModel, "id" | "name">): string {
  const named = model.name.match(/^([^:]{2,40}):\s/);
  return named ? named[1].trim() : model.id.split("/")[0];
}

/** "Anthropic: Claude Sonnet 5.5" → "Claude Sonnet 5.5". */
export const modelTitle = (model: Pick<OpenRouterModel, "name">) => model.name.replace(/^[^:]{2,40}:\s/, "");

export const isFree = (model: OpenRouterModel) =>
  model.id.endsWith(":free") || (model.prompt_per_m === 0 && model.completion_per_m === 0);

const money = (value: number) => (value >= 10 ? String(Math.round(value)) : String(+value.toFixed(2))).replace(".", ",");

/** "$2 / $10 per M token" oppure "gratis". */
export function priceLabel(model: OpenRouterModel): string | null {
  if (isFree(model)) return "gratis";
  if (model.prompt_per_m == null || model.completion_per_m == null) return null;
  return `$${money(model.prompt_per_m)} / $${money(model.completion_per_m)} per M token`;
}

export interface ProviderGroup {
  provider: string;
  models: OpenRouterModel[];
}

/**
 * Aziende ordinate per numero di modelli (le più note in cima), modelli dal più
 * recente. `query` filtra per nome, id o azienda; `freeOnly` tiene i gratuiti.
 */
export function groupByProvider(models: OpenRouterModel[], options: { query?: string; provider?: string | null; freeOnly?: boolean } = {}): ProviderGroup[] {
  const words = (options.query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const groups = new Map<string, OpenRouterModel[]>();
  for (const model of models) {
    const provider = providerOf(model);
    if (options.provider && provider !== options.provider) continue;
    if (options.freeOnly && !isFree(model)) continue;
    const haystack = `${model.name} ${model.id} ${provider}`.toLowerCase();
    if (words.some((word) => !haystack.includes(word))) continue;
    groups.set(provider, [...(groups.get(provider) ?? []), model]);
  }
  return [...groups.entries()]
    .map(([provider, list]) => ({ provider, models: list.sort((a, b) => (b.created ?? 0) - (a.created ?? 0) || a.name.localeCompare(b.name)) }))
    .sort((a, b) => b.models.length - a.models.length || a.provider.localeCompare(b.provider));
}

/** Aziende per i filtri rapidi: le più presenti nel catalogo. */
export function topProviders(models: OpenRouterModel[], limit = 8): string[] {
  return groupByProvider(models).slice(0, limit).map((group) => group.provider);
}

/** Pochi suggerimenti: il modello più recente di alcune famiglie note, più uno gratuito. */
export function suggestedOpenRouterModels(models: OpenRouterModel[]): OpenRouterModel[] {
  const families = [/^anthropic\/claude/, /^openai\/gpt/, /^google\/gemini/, /^deepseek\//, /:free$/];
  const picks: OpenRouterModel[] = [];
  for (const family of families) {
    const best = models
      .filter((m) => family.test(m.id) && !picks.includes(m) && !/preview|beta|image|audio/i.test(m.id))
      .sort((a, b) => (b.created ?? 0) - (a.created ?? 0))[0];
    if (best) picks.push(best);
  }
  return picks;
}

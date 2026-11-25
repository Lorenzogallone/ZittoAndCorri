// OpenRouter catalog for the model selector: grouped by company
// (Anthropic, OpenAI, Google…), with readable prices. Pure module, also used
// by the client.

import { DEFAULT_LOCALE, type Locale, type Translator } from "../../i18n/config.ts";

export interface OpenRouterModel {
  id: string;
  name: string;
  /** Price in dollars per million tokens (input, output); 0 = free. */
  prompt_per_m: number | null;
  completion_per_m: number | null;
  context: number | null;
  /** Release date (unix seconds), to suggest the most recent models. */
  created: number | null;
  /** Max response tokens declared by the provider; null if unknown. */
  max_output?: number | null;
}

/** "Anthropic: Claude Sonnet 5.5" → "Anthropic"; without a prefix uses the id ("x-ai/…" → "x-ai"). */
export function providerOf(model: Pick<OpenRouterModel, "id" | "name">): string {
  const named = model.name.match(/^([^:]{2,40}):\s/);
  return named ? named[1].trim() : model.id.split("/")[0];
}

/** "Anthropic: Claude Sonnet 5.5" → "Claude Sonnet 5.5". */
export const modelTitle = (model: Pick<OpenRouterModel, "name">) => model.name.replace(/^[^:]{2,40}:\s/, "");

export const isFree = (model: OpenRouterModel) =>
  model.id.endsWith(":free") || (model.prompt_per_m === 0 && model.completion_per_m === 0);

const money = (value: number, locale: Locale) =>
  (value >= 10 ? String(Math.round(value)) : String(+value.toFixed(2))).replace(".", locale === "it" ? "," : ".");

/** "$2 / $10 per M token" or "gratis" (`t` bound to the "labels" namespace). */
export function priceLabel(t: Translator, model: OpenRouterModel, locale: Locale = DEFAULT_LOCALE): string | null {
  if (isFree(model)) return t("price.free");
  if (model.prompt_per_m == null || model.completion_per_m == null) return null;
  return t("price.perMillionTokens", {
    input: `$${money(model.prompt_per_m, locale)}`,
    output: `$${money(model.completion_per_m, locale)}`,
  });
}

export interface ProviderGroup {
  provider: string;
  models: OpenRouterModel[];
}

/**
 * Companies sorted by number of models (best known on top), models from the most
 * recent. `query` filters by name, id or company; `freeOnly` keeps the free ones.
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

/** Companies for the quick filters: the most present in the catalog. */
export function topProviders(models: OpenRouterModel[], limit = 8): string[] {
  return groupByProvider(models).slice(0, limit).map((group) => group.provider);
}

/** A few suggestions: the most recent model of some known families, plus a free one. */
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

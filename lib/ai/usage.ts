// Tokens and cost of an AI call: shown under every coach response and
// under the run analysis, summed into the month total. Pure module: used
// by both the server (calculation and saving) and the interface.

export interface AiUsage {
  provider: "gemini" | "openrouter";
  model: string;
  input_tokens: number;
  output_tokens: number;
  /** Input tokens read from the provider cache (already included in input_tokens). */
  cached_tokens?: number;
  /** Input tokens written to the cache in this call (Claude: cost 1.25x). */
  cache_write_tokens?: number;
  /** Reasoning tokens (already included in output_tokens). */
  reasoning_tokens?: number;
  /** Dollars; null if the model price is unknown. */
  cost_usd: number | null;
  /** Part of the cost due to the prompt and the response, when the price list is known. */
  input_cost_usd?: number | null;
  output_cost_usd?: number | null;
  /** true if computed from the price list (Gemini) instead of charged (OpenRouter). */
  estimated: boolean;
  /** Summed calls: the analysis may first read the note and then evaluate. */
  calls?: number;
}

export interface TokenPrice {
  /** Dollars per million tokens. */
  input: number;
  output: number;
  cached?: number;
}

const count = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : 0);

/** Price-list cost of prompt and response: cached input costs less, reasoning is output. */
export function priceTokens(price: TokenPrice, input: number, output: number, cached = 0): { input: number; output: number } {
  const fresh = Math.max(0, input - cached);
  const cachedPrice = price.cached ?? price.input;
  return {
    input: (fresh * price.input + Math.min(cached, input) * cachedPrice) / 1_000_000,
    output: (output * price.output) / 1_000_000,
  };
}

/** Gemini usage (`usageMetadata`): reasoning tokens are paid as output. */
export function geminiUsage(
  model: string,
  meta: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number; cachedContentTokenCount?: number; toolUsePromptTokenCount?: number } | null | undefined,
  price: TokenPrice | null,
): AiUsage {
  const input = count(meta?.promptTokenCount) + count(meta?.toolUsePromptTokenCount);
  const reasoning = count(meta?.thoughtsTokenCount);
  const output = count(meta?.candidatesTokenCount) + reasoning;
  const cached = count(meta?.cachedContentTokenCount);
  const split = price && meta ? priceTokens(price, input, output, cached) : null;
  return {
    provider: "gemini",
    model,
    input_tokens: input,
    output_tokens: output,
    ...(cached ? { cached_tokens: cached } : {}),
    ...(reasoning ? { reasoning_tokens: reasoning } : {}),
    cost_usd: split ? split.input + split.output : null,
    input_cost_usd: split?.input ?? null,
    output_cost_usd: split?.output ?? null,
    estimated: true,
  };
}

/**
 * OpenRouter usage: `usage.cost` is the amount charged to the credit. If missing
 * it is estimated from the catalog price list, which also serves to split the charge between
 * prompt and response.
 */
export function openRouterUsage(
  model: string,
  usage: {
    prompt_tokens?: number;
    completion_tokens?: number;
    cost?: number | null;
    prompt_tokens_details?: { cached_tokens?: number | null; cache_write_tokens?: number | null } | null;
    completion_tokens_details?: { reasoning_tokens?: number | null } | null;
  } | null | undefined,
  price: TokenPrice | null,
): AiUsage {
  const input = count(usage?.prompt_tokens);
  const output = count(usage?.completion_tokens);
  const cached = count(usage?.prompt_tokens_details?.cached_tokens);
  const written = count(usage?.prompt_tokens_details?.cache_write_tokens);
  const reasoning = count(usage?.completion_tokens_details?.reasoning_tokens);
  const charged = typeof usage?.cost === "number" && Number.isFinite(usage.cost) ? usage.cost : null;
  const listed = price && usage ? priceTokens(price, input, output, cached) : null;
  const total = charged ?? (listed ? listed.input + listed.output : null);
  // Split proportional to the price list, brought back to the charged amount.
  const listedTotal = listed ? listed.input + listed.output : 0;
  const share = listed && total !== null ? (listedTotal > 0 ? listed.input / listedTotal : 0) : null;
  return {
    provider: "openrouter",
    model,
    input_tokens: input,
    output_tokens: output,
    ...(cached ? { cached_tokens: cached } : {}),
    ...(written ? { cache_write_tokens: written } : {}),
    ...(reasoning ? { reasoning_tokens: reasoning } : {}),
    cost_usd: total,
    input_cost_usd: share !== null ? total! * share : null,
    output_cost_usd: share !== null ? total! * (1 - share) : null,
    estimated: charged === null,
  };
}

const addAll = (values: Array<number | null | undefined>) =>
  values.some((value) => value == null) ? null : values.reduce<number>((sum, value) => sum + value!, 0);

/** Sums several calls of the same task; the model is that of the last one. */
export function sumUsage(items: Array<AiUsage | null | undefined>): AiUsage | null {
  const list = items.filter((item): item is AiUsage => !!item);
  if (!list.length) return null;
  if (list.length === 1) return list[0];
  const last = list[list.length - 1];
  const total = (key: "cached_tokens" | "cache_write_tokens" | "reasoning_tokens") => list.reduce((sum, item) => sum + (item[key] ?? 0), 0);
  const cached = total("cached_tokens");
  const written = total("cache_write_tokens");
  const reasoning = total("reasoning_tokens");
  return {
    provider: last.provider,
    model: last.model,
    input_tokens: list.reduce((sum, item) => sum + item.input_tokens, 0),
    output_tokens: list.reduce((sum, item) => sum + item.output_tokens, 0),
    ...(cached ? { cached_tokens: cached } : {}),
    ...(written ? { cache_write_tokens: written } : {}),
    ...(reasoning ? { reasoning_tokens: reasoning } : {}),
    cost_usd: addAll(list.map((item) => item.cost_usd)),
    input_cost_usd: addAll(list.map((item) => item.input_cost_usd)),
    output_cost_usd: addAll(list.map((item) => item.output_cost_usd)),
    estimated: list.some((item) => item.estimated),
    calls: list.reduce((sum, item) => sum + (item.calls ?? 1), 0),
  };
}

/** Usage saved in the metadata (jsonb): null if missing or malformed. */
export function readUsage(raw: unknown): AiUsage | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if ((value.provider !== "gemini" && value.provider !== "openrouter") || typeof value.model !== "string") return null;
  const usd = (key: string) => (typeof value[key] === "number" && Number.isFinite(value[key]) ? (value[key] as number) : null);
  return {
    provider: value.provider,
    model: value.model,
    input_tokens: count(value.input_tokens),
    output_tokens: count(value.output_tokens),
    ...(count(value.cached_tokens) ? { cached_tokens: count(value.cached_tokens) } : {}),
    ...(count(value.cache_write_tokens) ? { cache_write_tokens: count(value.cache_write_tokens) } : {}),
    ...(count(value.reasoning_tokens) ? { reasoning_tokens: count(value.reasoning_tokens) } : {}),
    cost_usd: usd("cost_usd"),
    input_cost_usd: usd("input_cost_usd"),
    output_cost_usd: usd("output_cost_usd"),
    estimated: value.estimated === true,
    ...(count(value.calls) > 1 ? { calls: count(value.calls) } : {}),
  };
}

/** "$0,012" with the Italian comma; below a thousandth "< $0,001". */
export function formatUsd(value: number | null): string {
  if (value === null) return "costo n.d.";
  if (value === 0) return "gratis";
  if (value < 0.001) return "< $0,001";
  const digits = value < 0.1 ? 3 : 2;
  return `$${value.toFixed(digits).replace(".", ",")}`;
}

/** 15234 → "15,2k". */
export function formatTokens(value: number): string {
  if (value < 1000) return String(value);
  const k = value / 1000;
  return `${k < 10 ? k.toFixed(1) : Math.round(k)}k`.replace(".", ",");
}

/** Short model name: "anthropic/claude-sonnet-5-5" → "claude-sonnet-5-5". */
export const shortModelName = (model: string) => model.split("/").pop()!.replace(/:free$/, " (free)");

export interface UsageSummary {
  /** Sum of known costs, in dollars. */
  total: number;
  byTask: { chat: number; analysis: number };
  calls: number;
  /** Some costs are estimated from the price list (Gemini). */
  estimated: boolean;
  /** Calls with unknown price, excluded from the total. */
  unpriced: number;
}

/** Total of the month from the ai_usage_events rows. */
export function summarizeUsage(rows: Array<{ task: string; cost_usd: number | string | null; estimated: boolean | null }>): UsageSummary {
  const summary: UsageSummary = { total: 0, byTask: { chat: 0, analysis: 0 }, calls: rows.length, estimated: false, unpriced: 0 };
  for (const row of rows) {
    const cost = row.cost_usd === null ? NaN : Number(row.cost_usd);
    if (!Number.isFinite(cost)) {
      summary.unpriced++;
      continue;
    }
    summary.total += cost;
    if (row.task === "chat" || row.task === "analysis") summary.byTask[row.task] += cost;
    if (row.estimated) summary.estimated = true;
  }
  return summary;
}

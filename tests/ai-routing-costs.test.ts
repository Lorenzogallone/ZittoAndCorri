import assert from "node:assert/strict";
import test from "node:test";
import { parseRouting, resolveTask, taskModel, withRoute, type ProviderAvailability } from "../lib/ai/routing.ts";
import { formatTokens, formatUsd, geminiUsage, openRouterUsage, readUsage, sumUsage, summarizeUsage } from "../lib/ai/usage.ts";
import { groupByProvider, modelTitle, priceLabel, providerOf, type OpenRouterModel } from "../lib/ai/openrouter-models.ts";

const both: ProviderAvailability = {
  gemini: { configured: true, model: "gemini-3.5-flash-lite" },
  openrouter: { configured: true, model: null },
};

test("senza scelte per compito vale il provider scelto prima per tutto", () => {
  const routing = parseRouting(null, "openrouter");
  assert.equal(routing.chat.provider, "openrouter");
  assert.equal(routing.analysis.provider, "openrouter");
  // OpenRouter senza modello non è utilizzabile: si ripiega su Gemini.
  assert.deepEqual(resolveTask(routing.chat, both), { provider: "gemini", model: "gemini-3.5-flash-lite" });
});

test("chat e analisi possono usare provider e modelli diversi", () => {
  let routing = parseRouting({ chat: { provider: "openrouter", openrouter: "anthropic/claude-sonnet-5-5" } }, "gemini");
  routing = withRoute(routing, "analysis", { provider: "gemini", gemini: "gemini-3.1-flash-lite" });
  assert.deepEqual(resolveTask(routing.chat, both), { provider: "openrouter", model: "anthropic/claude-sonnet-5-5" });
  assert.deepEqual(resolveTask(routing.analysis, both), { provider: "gemini", model: "gemini-3.1-flash-lite" });
  // Lo switch in chat torna a Gemini senza perdere il modello OpenRouter scelto.
  const flipped = withRoute(routing, "chat", { provider: "gemini" });
  assert.equal(flipped.chat.openrouter, "anthropic/claude-sonnet-5-5");
  assert.deepEqual(resolveTask(flipped.chat, both), { provider: "gemini", model: "gemini-3.5-flash-lite" });
});

test("se la chiave del provider scelto manca si usa l'altro, e un modello Gemini non valido torna al predefinito", () => {
  const route = { provider: "openrouter" as const, gemini: "gemini-9-ultra", openrouter: "openai/gpt-5-mini" };
  const onlyGemini = { gemini: { configured: true, model: null }, openrouter: { configured: false, model: null } };
  assert.deepEqual(resolveTask(route, onlyGemini), { provider: "gemini", model: "gemini-3.5-flash-lite" });
  assert.equal(taskModel(route, "openrouter", onlyGemini), null);
  assert.equal(resolveTask(route, { gemini: { configured: false, model: null }, openrouter: { configured: false, model: null } }), null);
  // Il modello salvato con la chiave OpenRouter fa da riserva per i compiti senza scelta.
  assert.equal(taskModel({ ...route, openrouter: null }, "openrouter", { ...both, openrouter: { configured: true, model: "deepseek/deepseek-v4" } }), "deepseek/deepseek-v4");
});

test("il costo di OpenRouter è quello addebitato, diviso tra prompt e risposta col listino", () => {
  const usage = openRouterUsage(
    "anthropic/claude-sonnet-5-5",
    { prompt_tokens: 20_000, completion_tokens: 1_000, cost: 0.05, prompt_tokens_details: { cached_tokens: 0 }, completion_tokens_details: { reasoning_tokens: 300 } },
    { input: 2, output: 10 },
  );
  assert.equal(usage.cost_usd, 0.05);
  assert.equal(usage.estimated, false);
  assert.equal(usage.reasoning_tokens, 300);
  // Listino: prompt 0,04 e risposta 0,01 → 80% / 20% dell'addebito.
  assert.ok(Math.abs(usage.input_cost_usd! - 0.04) < 1e-9);
  assert.ok(Math.abs(usage.output_cost_usd! - 0.01) < 1e-9);
  // Senza addebito nella risposta si stima dal listino; senza listino il costo è ignoto.
  const estimated = openRouterUsage("x/y", { prompt_tokens: 1_000_000, completion_tokens: 0 }, { input: 1, output: 4 });
  assert.equal(estimated.cost_usd, 1);
  assert.equal(estimated.estimated, true);
  assert.equal(openRouterUsage("x/y", { prompt_tokens: 10, completion_tokens: 5 }, null).cost_usd, null);
});

test("Gemini: ragionamento pagato come output, cache scontata, sempre stimato", () => {
  const usage = geminiUsage(
    "gemini-3.5-flash-lite",
    { promptTokenCount: 10_000, candidatesTokenCount: 500, thoughtsTokenCount: 1_500, cachedContentTokenCount: 4_000 },
    { input: 0.3, output: 2.5, cached: 0.03 },
  );
  assert.equal(usage.input_tokens, 10_000);
  assert.equal(usage.output_tokens, 2_000);
  assert.equal(usage.estimated, true);
  // 6000 × 0,3 + 4000 × 0,03 = 1920 µ$ di prompt; 2000 × 2,5 = 5000 µ$ di risposta.
  assert.ok(Math.abs(usage.input_cost_usd! - 0.00192) < 1e-9);
  assert.ok(Math.abs(usage.output_cost_usd! - 0.005) < 1e-9);
});

test("l'analisi somma lettura della nota e valutazione; i metadati si rileggono", () => {
  const a = geminiUsage("gemini-3.5-flash-lite", { promptTokenCount: 1000, candidatesTokenCount: 100 }, { input: 0.3, output: 2.5 });
  const b = geminiUsage("gemini-3.5-flash-lite", { promptTokenCount: 9000, candidatesTokenCount: 400 }, { input: 0.3, output: 2.5 });
  const total = sumUsage([null, a, b])!;
  assert.equal(total.input_tokens, 10_000);
  assert.equal(total.output_tokens, 500);
  assert.equal(total.calls, 2);
  assert.ok(Math.abs(total.cost_usd! - (a.cost_usd! + b.cost_usd!)) < 1e-12);
  assert.deepEqual(readUsage(JSON.parse(JSON.stringify(total))), total);
  assert.equal(readUsage({ provider: "x" }), null);
  assert.equal(sumUsage([]), null);
});

test("formati brevi e totale del mese", () => {
  assert.equal(formatUsd(0.0123), "$0,012");
  assert.equal(formatUsd(1.5), "$1,50");
  assert.equal(formatUsd(0.0004), "< $0,001");
  assert.equal(formatUsd(0), "gratis");
  assert.equal(formatUsd(null), "costo n.d.");
  assert.equal(formatTokens(15_234), "15k");
  assert.equal(formatTokens(4_560), "4,6k");
  assert.equal(formatTokens(640), "640");
  const month = summarizeUsage([
    { task: "chat", cost_usd: "0.012", estimated: false },
    { task: "analysis", cost_usd: 0.003, estimated: true },
    { task: "chat", cost_usd: null, estimated: false },
  ]);
  assert.ok(Math.abs(month.total - 0.015) < 1e-12);
  assert.ok(Math.abs(month.byTask.chat - 0.012) < 1e-12);
  assert.equal(month.calls, 3);
  assert.equal(month.unpriced, 1);
  assert.equal(month.estimated, true);
});

test("il catalogo OpenRouter si sfoglia per azienda, con prezzi leggibili", () => {
  const model = (id: string, name: string, p: number | null, c: number | null, created: number): OpenRouterModel => ({ id, name, prompt_per_m: p, completion_per_m: c, context: 200_000, created });
  const catalog = [
    model("anthropic/claude-sonnet-5-5", "Anthropic: Claude Sonnet 5.5", 2, 10, 300),
    model("anthropic/claude-haiku-5-5", "Anthropic: Claude Haiku 5.5", 0.1, 0.5, 290),
    model("openai/gpt-5-mini", "OpenAI: GPT-5 Mini", 0.25, 2, 200),
    model("meta-llama/llama-4:free", "Meta: Llama 4 (free)", 0, 0, 100),
    model("x-ai/grok-5", "Grok 5", 3, 15, 250),
  ];
  assert.equal(providerOf(catalog[0]), "Anthropic");
  assert.equal(providerOf(catalog[4]), "x-ai");
  assert.equal(modelTitle(catalog[0]), "Claude Sonnet 5.5");
  assert.equal(priceLabel(catalog[0]), "$2 / $10 per M token");
  assert.equal(priceLabel(catalog[1]), "$0,1 / $0,5 per M token");
  assert.equal(priceLabel(catalog[3]), "gratis");
  const groups = groupByProvider(catalog);
  assert.equal(groups[0].provider, "Anthropic");
  assert.deepEqual(groups[0].models.map((m) => m.id), ["anthropic/claude-sonnet-5-5", "anthropic/claude-haiku-5-5"]);
  assert.deepEqual(groupByProvider(catalog, { freeOnly: true }).map((g) => g.provider), ["Meta"]);
  assert.deepEqual(groupByProvider(catalog, { query: "haiku" })[0].models.map((m) => m.id), ["anthropic/claude-haiku-5-5"]);
  assert.deepEqual(groupByProvider(catalog, { provider: "OpenAI" }).map((g) => g.provider), ["OpenAI"]);
});

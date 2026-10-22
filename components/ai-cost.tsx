"use client";

import { cn } from "@/lib/utils";
import { formatTokens, formatUsd, shortModelName, type AiUsage } from "@/lib/ai/usage";

/** Quale parte del costo mostrare nella riga compatta. */
export type CostPart = "prompt" | "reply" | "total";

const approx = (usage: AiUsage, value: number | null | undefined) =>
  value == null ? null : `${usage.estimated && value > 0 ? "≈ " : ""}${formatUsd(value)}`;

/** Testo breve per la riga sotto il messaggio. */
export function costSummary(usage: AiUsage, part: CostPart): string {
  if (part === "prompt") {
    return [`prompt ${formatTokens(usage.input_tokens)} token`, approx(usage, usage.input_cost_usd)].filter(Boolean).join(" · ");
  }
  if (part === "reply") {
    const reply = approx(usage, usage.output_cost_usd);
    return [
      `risposta ${formatTokens(usage.output_tokens)} token`,
      reply ?? (usage.cost_usd != null ? `totale ${approx(usage, usage.cost_usd)}` : null),
      shortModelName(usage.model),
    ].filter(Boolean).join(" · ");
  }
  return [approx(usage, usage.cost_usd) ?? "costo n.d.", shortModelName(usage.model)].join(" · ");
}

const precise = (value: number | null | undefined) =>
  value == null ? "n.d." : value === 0 ? "gratis" : `$${value.toFixed(value < 0.01 ? 4 : 3).replace(".", ",")}`;

const int = (value: number) => value.toLocaleString("it-IT");

/** Dettaglio completo: token, costo di prompt e risposta, modello. */
export function UsageBreakdown({ usage, className }: { usage: AiUsage; className?: string }) {
  return (
    <dl className={cn("mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-left text-micro leading-relaxed", className)}>
      <dt className="text-muted-foreground">Prompt</dt>
      <dd>
        {int(usage.input_tokens)} token{usage.cached_tokens ? ` (${int(usage.cached_tokens)} in cache)` : ""} · {precise(usage.input_cost_usd)}
      </dd>
      <dt className="text-muted-foreground">Risposta</dt>
      <dd>
        {int(usage.output_tokens)} token{usage.reasoning_tokens ? ` (${int(usage.reasoning_tokens)} di ragionamento)` : ""} · {precise(usage.output_cost_usd)}
      </dd>
      <dt className="text-muted-foreground">Totale</dt>
      <dd>
        {precise(usage.cost_usd)}{" "}
        <span className="text-muted-foreground">
          {usage.estimated ? (usage.provider === "gemini" ? "· stima a listino, gratis con il piano free" : "· stima a listino") : "· addebitato da OpenRouter"}
        </span>
      </dd>
      <dt className="text-muted-foreground">Modello</dt>
      <dd className="break-all">
        {usage.model}{usage.calls && usage.calls > 1 ? ` · ${usage.calls} chiamate` : ""}
      </dd>
    </dl>
  );
}

/** Riga compatta che si apre sul dettaglio. */
export function AiCost({ usage, part, prefix, className }: { usage: AiUsage; part: CostPart; prefix?: string; className?: string }) {
  return (
    <details className={cn("group text-micro text-muted-foreground", className)}>
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        {prefix ? `${prefix} · ` : ""}{costSummary(usage, part)}
      </summary>
      <UsageBreakdown usage={usage} className="text-foreground/80" />
    </details>
  );
}

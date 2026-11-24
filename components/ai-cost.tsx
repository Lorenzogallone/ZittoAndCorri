"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { formatTokens, formatUsd, shortModelName, type AiUsage } from "@/lib/ai/usage";

/** Quale parte del costo mostrare nella riga compatta. */
export type CostPart = "prompt" | "reply" | "total";

type CostT = ReturnType<typeof useTranslations<"coach.cost">>;

const approx = (usage: AiUsage, value: number | null | undefined) =>
  value == null ? null : `${usage.estimated && value > 0 ? "≈ " : ""}${formatUsd(value)}`;

/** Testo breve per la riga sotto il messaggio. */
export function costSummary(usage: AiUsage, part: CostPart, t: CostT): string {
  if (part === "prompt") {
    return [t("promptTokens", { tokens: formatTokens(usage.input_tokens) }), approx(usage, usage.input_cost_usd)].filter(Boolean).join(" · ");
  }
  if (part === "reply") {
    const reply = approx(usage, usage.output_cost_usd);
    return [
      t("replyTokens", { tokens: formatTokens(usage.output_tokens) }),
      reply ?? (usage.cost_usd != null ? t("totalCost", { cost: approx(usage, usage.cost_usd) ?? "" }) : null),
      shortModelName(usage.model),
    ].filter(Boolean).join(" · ");
  }
  return [approx(usage, usage.cost_usd) ?? t("costUnknown"), shortModelName(usage.model)].join(" · ");
}

const precise = (value: number | null | undefined, t: CostT) =>
  value == null ? t("notAvailable") : value === 0 ? t("free") : `$${value.toFixed(value < 0.01 ? 4 : 3).replace(".", ",")}`;

const int = (value: number) => value.toLocaleString("it-IT");

/** Dettaglio completo: token, costo di prompt e risposta, modello. */
export function UsageBreakdown({ usage, className }: { usage: AiUsage; className?: string }) {
  const t = useTranslations("coach.cost");
  return (
    <dl className={cn("mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-left text-micro leading-relaxed", className)}>
      <dt className="text-muted-foreground">{t("prompt")}</dt>
      <dd>
        {usage.cached_tokens
          ? t("tokensCached", { tokens: int(usage.input_tokens), cached: int(usage.cached_tokens) })
          : t("tokens", { tokens: int(usage.input_tokens) })} · {precise(usage.input_cost_usd, t)}
      </dd>
      <dt className="text-muted-foreground">{t("reply")}</dt>
      <dd>
        {usage.reasoning_tokens
          ? t("tokensReasoning", { tokens: int(usage.output_tokens), reasoning: int(usage.reasoning_tokens) })
          : t("tokens", { tokens: int(usage.output_tokens) })} · {precise(usage.output_cost_usd, t)}
      </dd>
      <dt className="text-muted-foreground">{t("total")}</dt>
      <dd>
        {precise(usage.cost_usd, t)}{" "}
        <span className="text-muted-foreground">
          · {usage.estimated ? (usage.provider === "gemini" ? t("estimateFree") : t("estimate")) : t("chargedByOpenRouter")}
        </span>
      </dd>
      <dt className="text-muted-foreground">{t("model")}</dt>
      <dd className="break-all">
        {usage.model}{usage.calls && usage.calls > 1 ? ` · ${t("calls", { count: usage.calls })}` : ""}
      </dd>
    </dl>
  );
}

/** Riga compatta che si apre sul dettaglio. */
export function AiCost({ usage, part, prefix, className }: { usage: AiUsage; part: CostPart; prefix?: string; className?: string }) {
  const t = useTranslations("coach.cost");
  return (
    <details className={cn("group text-micro text-muted-foreground", className)}>
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        {prefix ? `${prefix} · ` : ""}{costSummary(usage, part, t)}
      </summary>
      <UsageBreakdown usage={usage} className="text-foreground/80" />
    </details>
  );
}

"use client";

import { useLocale, useTranslations } from "next-intl";
import { intlLocale, type Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";
import { formatTokens, formatUsd, shortModelName, type AiUsage } from "@/lib/ai/usage";

/** Which part of the cost to show in the compact row. */
export type CostPart = "prompt" | "reply" | "total";

type CostT = ReturnType<typeof useTranslations<"coach.cost">>;

const approx = (usage: AiUsage, value: number | null | undefined) =>
  value == null ? null : `${usage.estimated && value > 0 ? "≈ " : ""}${formatUsd(value)}`;

/** Short text for the row under the message. */
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

const precise = (value: number | null | undefined, t: CostT, locale: Locale) => {
  if (value == null) return t("notAvailable");
  if (value === 0) return t("free");
  const digits = value < 0.01 ? 4 : 3;
  return `$${value.toLocaleString(intlLocale(locale), { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
};

const int = (value: number, locale: Locale) => value.toLocaleString(intlLocale(locale));

/** Full detail: tokens, prompt and reply cost, model. */
export function UsageBreakdown({ usage, className }: { usage: AiUsage; className?: string }) {
  const t = useTranslations("coach.cost");
  const locale = useLocale() as Locale;
  return (
    <dl className={cn("mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-left text-micro leading-relaxed", className)}>
      <dt className="text-muted-foreground">{t("prompt")}</dt>
      <dd>
        {usage.cached_tokens
          ? t("tokensCached", { tokens: int(usage.input_tokens, locale), cached: int(usage.cached_tokens, locale) })
          : t("tokens", { tokens: int(usage.input_tokens, locale) })} · {precise(usage.input_cost_usd, t, locale)}
      </dd>
      <dt className="text-muted-foreground">{t("reply")}</dt>
      <dd>
        {usage.reasoning_tokens
          ? t("tokensReasoning", { tokens: int(usage.output_tokens, locale), reasoning: int(usage.reasoning_tokens, locale) })
          : t("tokens", { tokens: int(usage.output_tokens, locale) })} · {precise(usage.output_cost_usd, t, locale)}
      </dd>
      <dt className="text-muted-foreground">{t("total")}</dt>
      <dd>
        {precise(usage.cost_usd, t, locale)}{" "}
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

/** Compact row that opens the detail. */
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

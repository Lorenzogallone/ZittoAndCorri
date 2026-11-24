"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@/i18n/config";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { OpenRouterModelPicker } from "@/components/openrouter-model-picker";
import { cn } from "@/lib/utils";
import { DEFAULT_GEMINI_MODEL, GEMINI_MODELS, geminiPrice, isGeminiModelId } from "@/lib/ai/models";
import { modelTitle, priceLabel, providerOf, type OpenRouterModel } from "@/lib/ai/openrouter-models";
import { AI_TASKS, type AiProvider, type AiTask } from "@/lib/ai/routing";
import { formatUsd, type UsageSummary } from "@/lib/ai/usage";
import { saveAiRoute } from "./actions";

export interface TaskRouteView {
  /** Provider in uso (quello scelto, o l'altro se il scelto non è pronto). */
  provider: AiProvider;
  gemini: string | null;
  openrouter: string | null;
}

const NAMES: Record<AiProvider, string> = { gemini: "Gemini", openrouter: "OpenRouter" };

const usd = (value: number) => `$${String(+value.toFixed(2)).replace(".", ",")}`;

function TaskRow({
  task,
  initial,
  keys,
  models,
  disabled,
}: {
  task: AiTask;
  initial: TaskRouteView;
  keys: { gemini: boolean; openrouter: boolean };
  models: OpenRouterModel[];
  disabled: boolean;
}) {
  const t = useTranslations("settings.models");
  const tl = useTranslations("labels");
  const locale = useLocale() as Locale;
  const [route, setRoute] = useState(initial);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const taskTitle = t(`tasks.${task}.title`);
  const taskName = taskTitle.toLowerCase();
  const geminiPriceLine = (model: string) => {
    const price = geminiPrice(model);
    return price ? t("priceLine", { input: usd(price.input), output: usd(price.output) }) : null;
  };
  const routerModel = route.openrouter ? models.find((m) => m.id === route.openrouter) : undefined;

  async function save(provider: AiProvider, model: string) {
    const previous = route;
    setRoute({ ...route, provider, [provider]: model });
    setPending(true);
    setSaved(false);
    setError(null);
    const result = await saveAiRoute(task, provider, model);
    if (result.error) {
      setRoute(previous);
      setError(result.error);
    } else setSaved(true);
    setPending(false);
  }

  function chooseProvider(provider: AiProvider) {
    if (provider === route.provider || pending) return;
    // OpenRouter senza modello: prima si sceglie dall'elenco, poi si salva.
    if (provider === "openrouter" && !route.openrouter) return setPickerOpen(true);
    void save(provider, provider === "gemini" ? route.gemini ?? DEFAULT_GEMINI_MODEL : route.openrouter!);
  }

  return (
    <div className="space-y-3 py-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium">{taskTitle}</p>
        {saved && !pending && <span className="text-xs text-emerald-600">{t("saved")}</span>}
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">{t(`tasks.${task}.hint`)}</p>

      <div className="grid grid-cols-2 rounded-xl bg-muted p-1 text-sm font-medium" role="radiogroup" aria-label={t("providerFor", { task: taskName })}>
        {(["gemini", "openrouter"] as const).map((provider) => (
          <button
            key={provider}
            type="button"
            role="radio"
            aria-checked={route.provider === provider}
            disabled={disabled || pending || !keys[provider]}
            onClick={() => chooseProvider(provider)}
            className={cn(
              "rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50",
              route.provider === provider ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
            )}
            title={keys[provider] ? undefined : t("addKey", { provider: NAMES[provider] })}
          >
            {NAMES[provider]}
          </button>
        ))}
      </div>

      {route.provider === "gemini" ? (
        <div className="space-y-1.5">
          <Select
            value={route.gemini ?? DEFAULT_GEMINI_MODEL}
            onValueChange={(value) => isGeminiModelId(value) && value !== route.gemini && void save("gemini", value)}
            disabled={disabled || pending || !keys.gemini}
          >
            <SelectTrigger className="w-full" aria-label={t("geminiModelFor", { task: taskName })}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" align="start">
              {GEMINI_MODELS.map((model) => (
                <SelectItem key={model.id} value={model.id}>{model.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{geminiPriceLine(route.gemini ?? DEFAULT_GEMINI_MODEL)}</p>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled || pending}
          onClick={() => setPickerOpen(true)}
          className="flex w-full items-center gap-3 rounded-xl border border-input px-3 py-2.5 text-left disabled:opacity-50"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">
              {routerModel ? <><span className="text-muted-foreground">{providerOf(routerModel)} · </span>{modelTitle(routerModel)}</> : route.openrouter ?? t("chooseModel")}
            </span>
            {routerModel && <span className="block truncate text-xs text-muted-foreground">{priceLabel(tl, routerModel, locale)}</span>}
          </span>
          <ChevronRight size={16} className="shrink-0 text-muted-foreground" />
        </button>
      )}

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      <OpenRouterModelPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        models={models}
        value={route.openrouter}
        onSelect={(model) => void save("openrouter", model)}
        title={t("pickerTitle", { task: taskName })}
      />
    </div>
  );
}

/** Provider e modello per la chat e per le analisi, e quanto si è speso nel mese. */
export function TaskModelsSection({
  perTask,
  keys,
  tasks,
  models,
  month,
}: {
  perTask: boolean;
  keys: { gemini: boolean; openrouter: boolean };
  tasks: Record<AiTask, TaskRouteView>;
  models: OpenRouterModel[];
  month: UsageSummary | null;
}) {
  const t = useTranslations("settings.models");
  if (!keys.gemini && !keys.openrouter) {
    return <p className="py-4 text-sm text-muted-foreground">{t("noKeys")}</p>;
  }
  return (
    <>
      {!perTask && (
        <p className="py-4 text-sm text-muted-foreground">{t("migrationNeeded")}</p>
      )}
      {AI_TASKS.map((task) => (
        <TaskRow key={task} task={task} initial={tasks[task]} keys={keys} models={models} disabled={!perTask} />
      ))}
      {month && month.calls > 0 && (
        <div className="py-4">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-medium">{t("month.title")}</p>
            <p className="text-lg font-semibold tabular-nums">{formatUsd(month.total)}</p>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {t(month.estimated ? "month.summaryEstimated" : "month.summary", {
              chat: formatUsd(month.byTask.chat),
              analysis: formatUsd(month.byTask.analysis),
              calls: month.calls,
            })}
          </p>
        </div>
      )}
    </>
  );
}

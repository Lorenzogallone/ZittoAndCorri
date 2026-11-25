import { getLocale, getTranslations } from "next-intl/server";
import { listOpenRouterModels, suggestedOpenRouterModels } from "@/lib/ai/openrouter";
import { isFree, modelTitle, providerOf } from "@/lib/ai/openrouter-models";
import { OnboardingForm, type ModelSuggestion } from "./onboarding-form";

export default async function OnboardingPage() {
  const [locale, t] = await Promise.all([getLocale(), getTranslations("onboarding.ai")]);
  const money = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  // Catalog cached for one day; if OpenRouter doesn't respond the free field remains.
  const models = await listOpenRouterModels();
  const suggestions: ModelSuggestion[] = suggestedOpenRouterModels(models).map((model) => ({
    id: model.id,
    title: `${providerOf(model)} · ${modelTitle(model)}`,
    price: isFree(model)
      ? t("free")
      : model.prompt_per_m != null && model.completion_per_m != null
        ? `$${money.format(model.prompt_per_m)} / $${money.format(model.completion_per_m)} ${t("perMillion")}`
        : null,
    free: isFree(model),
  }));

  return (
    // Full-height column: header at the top, "Continua" at the bottom
    // within thumb reach; safe areas keep notch and home indicator away.
    <main className="flex min-h-svh flex-col bg-background pb-safe pt-safe text-foreground">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 pb-6 pt-4">
        <OnboardingForm modelSuggestions={suggestions} />
      </div>
    </main>
  );
}

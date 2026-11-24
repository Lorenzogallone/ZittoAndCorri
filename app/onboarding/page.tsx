import { listOpenRouterModels, suggestedOpenRouterModels } from "@/lib/ai/openrouter";
import { isFree, modelTitle, priceLabel, providerOf } from "@/lib/ai/openrouter-models";
import { OnboardingForm, type ModelSuggestion } from "./onboarding-form";

export default async function OnboardingPage() {
  // Catalogo in cache per un giorno; se OpenRouter non risponde resta il campo libero.
  const models = await listOpenRouterModels();
  const suggestions: ModelSuggestion[] = suggestedOpenRouterModels(models).map((model) => ({
    id: model.id,
    title: `${providerOf(model)} · ${modelTitle(model)}`,
    price: priceLabel(model),
    free: isFree(model),
  }));

  return (
    // Colonna a tutta altezza: intestazione in alto, "Continua" in fondo a
    // portata di pollice; le safe-area tengono lontani notch e home-indicator.
    <main className="flex min-h-svh flex-col bg-background pb-safe pt-safe text-foreground">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 pb-6 pt-4">
        <OnboardingForm modelSuggestions={suggestions} />
      </div>
    </main>
  );
}

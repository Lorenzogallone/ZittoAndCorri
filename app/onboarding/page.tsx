import { OnboardingForm } from "./onboarding-form";

export default function OnboardingPage() {
  return (
    // Colonna a tutta altezza: intestazione in alto, "Continua" in fondo a
    // portata di pollice; le safe-area tengono lontani notch e home-indicator.
    <main className="flex min-h-svh flex-col bg-background pb-safe pt-safe text-foreground">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 pb-6 pt-4">
        <OnboardingForm />
      </div>
    </main>
  );
}

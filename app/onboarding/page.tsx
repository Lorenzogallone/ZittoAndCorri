import { OnboardingForm } from "./onboarding-form";

export default function OnboardingPage() {
  return (
    <main className="min-h-svh bg-background px-6 py-12 text-foreground">
      <div className="mx-auto flex min-h-[calc(100svh-6rem)] max-w-md items-center">
        <OnboardingForm />
      </div>
    </main>
  );
}

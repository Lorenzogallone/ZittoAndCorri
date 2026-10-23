"use client";

import { useActionState, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RunnerMark } from "@/components/runner-mark";
import { cn } from "@/lib/utils";
import { completeOnboarding, type OnboardingState } from "./actions";

const initialState: OnboardingState = {};

// Stesse distanze dei form obiettivo (app/goals/goal-fields.tsx), in km.
const DISTANCES = [
  { key: "5", label: "5 km", km: "5" },
  { key: "10", label: "10 km", km: "10" },
  { key: "half", label: "Mezza", km: "21.0975" },
  { key: "full", label: "Maratona", km: "42.195" },
  { key: "other", label: "Altro", km: "" },
] as const;

type DistanceKey = (typeof DISTANCES)[number]["key"];

const STEPS = 3;

export function OnboardingForm() {
  const [step, setStep] = useState(0);
  const [state, action, pending] = useActionState(completeOnboarding, initialState);
  // La distanza resta un unico valore in km nel campo `distance_km`: le
  // pillole lo riempiono, "Altro" mostra l'input numerico.
  const [distanceChoice, setDistanceChoice] = useState<DistanceKey | null>(null);
  const [distanceKm, setDistanceKm] = useState("");
  const otherRef = useRef<HTMLInputElement>(null);

  function chooseDistance(key: DistanceKey, km: string) {
    if (distanceChoice === key) {
      // Secondo tocco: nessuna distanza (l'obiettivo è facoltativo).
      setDistanceChoice(null);
      setDistanceKm("");
      return;
    }
    setDistanceChoice(key);
    setDistanceKm(km);
    if (key === "other") requestAnimationFrame(() => otherRef.current?.focus());
  }

  return (
    <form action={action} className="flex w-full flex-1 flex-col">
      <div className="flex h-9 items-center justify-between">
        {step > 0 ? (
          <Button type="button" variant="ghost" size="sm" className="-ml-3" onClick={() => setStep((value) => value - 1)}>
            <ChevronLeft /> Indietro
          </Button>
        ) : (
          <span />
        )}
        <p className="eyebrow tabular-nums">Passo {step + 1} di {STEPS}</p>
      </div>

      <div className="mb-8 mt-3 flex gap-1.5" aria-hidden="true">
        {Array.from({ length: STEPS }, (_, value) => (
          <span
            key={value}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors duration-300",
              value === step ? "bg-primary" : value < step ? "bg-primary/50" : "bg-muted",
            )}
          />
        ))}
      </div>

      <div className={step === 0 ? "animate-enter space-y-5" : "hidden"}>
        <div>
          <h1 className="font-display text-display font-bold tracking-tight">Conosciamoci meglio</h1>
          <p className="mt-2 text-body text-muted-foreground">Questi dati rendono affidabili zone e suggerimenti. Puoi lasciare vuoto ciò che non conosci.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2"><Label htmlFor="max_hr">HR massima</Label><Input id="max_hr" name="max_hr" type="number" min="100" max="240" placeholder="190" /></div>
          <div className="space-y-2"><Label htmlFor="resting_hr">HR a riposo</Label><Input id="resting_hr" name="resting_hr" type="number" min="30" max="120" placeholder="50" /></div>
        </div>
        <div className="space-y-2"><Label htmlFor="birthdate">Data di nascita</Label><Input id="birthdate" name="birthdate" type="date" /></div>
      </div>

      <div className={step === 1 ? "animate-enter space-y-5" : "hidden"}>
        <div>
          <h1 className="font-display text-display font-bold tracking-tight">Il tuo obiettivo</h1>
          <p className="mt-2 text-body text-muted-foreground">Facoltativo: non serve una gara. Puoi indicare solo la distanza su cui vuoi migliorare oppure una gara con la sua data.</p>
        </div>
        <div className="space-y-2"><Label htmlFor="race_name">Nome gara (opzionale)</Label><Input id="race_name" name="race_name" placeholder="Vuoto = obiettivo generico" /></div>
        <div className="space-y-2">
          <Label id="distance_label">Distanza</Label>
          <input type="hidden" name="distance_km" value={distanceKm} />
          <div role="group" aria-labelledby="distance_label" className="flex flex-wrap gap-2">
            {DISTANCES.map((option) => {
              const selected = distanceChoice === option.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => chooseDistance(option.key, option.km)}
                  className={cn(
                    "h-9 rounded-full px-4 text-caption font-semibold transition-all duration-200 active:scale-95",
                    selected ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20" : "bg-muted text-foreground",
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          {distanceChoice === "other" && (
            <div className="animate-enter pt-1">
              <Label htmlFor="distance_other" className="sr-only">Distanza in km</Label>
              <Input
                ref={otherRef}
                id="distance_other"
                type="number"
                step="0.001"
                min="0"
                inputMode="decimal"
                placeholder="Distanza in km, es. 15"
                value={distanceKm}
                onChange={(event) => setDistanceKm(event.target.value)}
              />
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2"><Label htmlFor="race_date">Data gara</Label><Input id="race_date" name="race_date" type="date" /></div>
          <div className="space-y-2"><Label htmlFor="target_time">Tempo target</Label><Input id="target_time" name="target_time" placeholder="1:45:00" /></div>
        </div>
      </div>

      <div className={step === 2 ? "animate-enter space-y-5" : "hidden"}>
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-hero text-primary">
          <RunnerMark size={48} cutout="var(--hero)" node="var(--hero-foreground)" />
        </span>
        <div>
          <h1 className="font-display text-display font-bold tracking-tight">Attiva il Coach AI</h1>
          <p className="mt-2 text-body text-muted-foreground">Inserisci la tua chiave Gemini. Puoi saltare e configurarla più tardi dalle impostazioni.</p>
        </div>
        <div className="space-y-2"><Label htmlFor="gemini_key">Chiave Gemini</Label><Input id="gemini_key" name="gemini_key" type="password" autoComplete="off" placeholder="AIza…" /></div>
        <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="inline-block text-sm font-medium text-primary">Crea una chiave in Google AI Studio ↗</a>
      </div>

      {state.error && <p role="alert" className="mt-5 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{state.error}</p>}

      <div className="mt-auto pt-10">
        {/* Chiavi diverse: senza, React riusa lo stesso <button> e il tocco su
            "Continua" del passo 2, diventato type="submit", invierebbe il form. */}
        {step < STEPS - 1 ? (
          <Button key="next" type="button" size="lg" className="w-full" onClick={() => setStep((value) => value + 1)}>
            Continua <ChevronRight />
          </Button>
        ) : (
          <Button key="submit" type="submit" size="lg" className="w-full" disabled={pending}>
            {pending ? "Configuro…" : "Entra nell'app"}
          </Button>
        )}
      </div>
    </form>
  );
}

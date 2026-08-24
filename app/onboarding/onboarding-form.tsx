"use client";

import { useActionState, useState } from "react";
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { completeOnboarding, type OnboardingState } from "./actions";

const initialState: OnboardingState = {};

export function OnboardingForm() {
  const [step, setStep] = useState(0);
  const [state, action, pending] = useActionState(completeOnboarding, initialState);

  return (
    <form action={action} className="w-full max-w-md">
      <div className="mb-6 flex gap-2">
        {[0, 1, 2].map((value) => (
          <span key={value} className={`h-1.5 flex-1 rounded-full ${value <= step ? "bg-primary" : "bg-muted"}`} />
        ))}
      </div>

      <div className={step === 0 ? "space-y-5" : "hidden"}>
        <div><h1 className="text-2xl font-bold">Conosciamoci meglio</h1><p className="mt-2 text-sm text-muted-foreground">Questi dati rendono affidabili zone e suggerimenti. Puoi lasciare vuoto ciò che non conosci.</p></div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2"><Label htmlFor="max_hr">HR massima</Label><Input id="max_hr" name="max_hr" type="number" min="100" max="240" placeholder="190" /></div>
          <div className="space-y-2"><Label htmlFor="resting_hr">HR a riposo</Label><Input id="resting_hr" name="resting_hr" type="number" min="30" max="120" placeholder="50" /></div>
        </div>
        <div className="space-y-2"><Label htmlFor="birthdate">Data di nascita</Label><Input id="birthdate" name="birthdate" type="date" /></div>
      </div>

      <div className={step === 1 ? "space-y-5" : "hidden"}>
        <div><h1 className="text-2xl font-bold">Il tuo obiettivo</h1><p className="mt-2 text-sm text-muted-foreground">Facoltativo: il coach può iniziare anche senza una gara.</p></div>
        <div className="space-y-2"><Label htmlFor="race_name">Nome gara</Label><Input id="race_name" name="race_name" placeholder="Mezza maratona di…" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2"><Label htmlFor="distance_km">Distanza km</Label><Input id="distance_km" name="distance_km" type="number" step="0.001" /></div>
          <div className="space-y-2"><Label htmlFor="race_date">Data</Label><Input id="race_date" name="race_date" type="date" /></div>
        </div>
        <div className="space-y-2"><Label htmlFor="target_time">Tempo target</Label><Input id="target_time" name="target_time" placeholder="1:45:00" /></div>
      </div>

      <div className={step === 2 ? "space-y-5" : "hidden"}>
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary"><Sparkles /></div>
        <div><h1 className="text-2xl font-bold">Attiva il Coach AI</h1><p className="mt-2 text-sm text-muted-foreground">Inserisci la tua chiave Gemini. Puoi saltare e configurarla più tardi dalle impostazioni.</p></div>
        <div className="space-y-2"><Label htmlFor="gemini_key">Chiave Gemini</Label><Input id="gemini_key" name="gemini_key" type="password" autoComplete="off" placeholder="AIza…" /></div>
        <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-sm font-medium text-primary">Crea una chiave in Google AI Studio ↗</a>
      </div>

      {state.error && <p role="alert" className="mt-5 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{state.error}</p>}

      <div className="mt-8 flex gap-3">
        {step > 0 && <Button type="button" variant="outline" onClick={() => setStep((value) => value - 1)}><ChevronLeft size={16} /> Indietro</Button>}
        {step < 2 ? (
          <Button type="button" className="ml-auto" onClick={() => setStep((value) => value + 1)}>Continua <ChevronRight size={16} /></Button>
        ) : (
          <Button type="submit" className="ml-auto" disabled={pending}>{pending ? "Configuro…" : "Entra nell'app"}</Button>
        )}
      </div>
    </form>
  );
}

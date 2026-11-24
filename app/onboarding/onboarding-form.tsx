"use client";

import { useActionState, useRef, useState } from "react";
import { Activity, CalendarDays, ChevronLeft, ChevronRight, MessageCircle, Watch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TextField } from "@/components/ui/text-field";
import { Label } from "@/components/ui/label";
import { Segmented } from "@/components/ui/segmented";
import { RunnerMark } from "@/components/runner-mark";
import { cn } from "@/lib/utils";
import { handleEnterKeyHint } from "@/lib/form-keys";
import { DECIMAL_PATTERN, DURATION_PATTERN } from "@/lib/format";
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

const STEPS = 5;

type GoalKind = "race" | "improve" | "none";
type Provider = "gemini" | "openrouter";

const GOAL_OPTIONS: Array<{ key: GoalKind; title: string; text: string }> = [
  { key: "race", title: "Preparare una gara", text: "Hai una data: il piano punta a quel giorno." },
  { key: "improve", title: "Migliorare su una distanza", text: "Nessuna gara in vista: lavori per correre meglio sui 5 km, sui 10 km…" },
  { key: "none", title: "Solo allenarmi", text: "Nessun obiettivo per ora. Potrai aggiungerlo quando vuoi." },
];

const INTRO = [
  { icon: MessageCircle, title: "Coach AI", text: "Una chat con un coach che conosce i tuoi allenamenti e propone modifiche al piano, sempre da approvare." },
  { icon: CalendarDays, title: "Piano su misura", text: "Quattordici giorni di allenamenti che si adattano a come stai e al meteo." },
  { icon: Activity, title: "Corse e progressi", text: "Importa le corse da file o dall'orologio: analisi, forma, previsioni e record." },
  { icon: Watch, title: "Il tuo orologio", text: "I dati di sonno e recupero arrivano dall'orologio e il piano ci torna come allenamenti guidati." },
];

export interface ModelSuggestion {
  id: string;
  title: string;
  price: string | null;
  free: boolean;
}

export function OnboardingForm({ modelSuggestions }: { modelSuggestions: ModelSuggestion[] }) {
  const [step, setStep] = useState(0);
  const [goalKind, setGoalKind] = useState<GoalKind>("none");
  const [provider, setProvider] = useState<Provider>("gemini");
  const [openRouterModel, setOpenRouterModel] = useState("");
  const [after, setAfter] = useState<"home" | "links">("home");
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
    <form action={action} onKeyDown={handleEnterKeyHint} className="flex w-full flex-1 flex-col">
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

      <div className={step === 0 ? "animate-enter space-y-6" : "hidden"}>
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-hero text-primary">
          <RunnerMark size={48} cutout="var(--hero)" node="var(--hero-foreground)" />
        </span>
        <div>
          <h1 className="font-display text-display font-bold tracking-tight">Benvenuto in Zitto e Corri</h1>
          <p className="mt-2 text-body text-muted-foreground">Il tuo coach di corsa sempre in tasca. Ti servono un paio di minuti per configurarlo su di te; tutto si può cambiare dopo dalle impostazioni.</p>
        </div>
        <ul className="space-y-4">
          {INTRO.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-primary"><Icon size={18} aria-hidden="true" /></span>
              <div>
                <p className="text-body font-semibold">{title}</p>
                <p className="text-caption text-muted-foreground">{text}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className={step === 1 ? "animate-enter space-y-5" : "hidden"}>
        <div>
          <h1 className="font-display text-display font-bold tracking-tight">Conosciamoci meglio</h1>
          <p className="mt-2 text-body text-muted-foreground">Questi dati rendono affidabili zone e suggerimenti. Puoi lasciare vuoto ciò che non conosci.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2"><Label htmlFor="max_hr">HR massima</Label><Input id="max_hr" name="max_hr" type="number" inputMode="numeric" enterKeyHint="next" autoComplete="off" min="100" max="240" placeholder="190" /></div>
          <div className="space-y-2"><Label htmlFor="resting_hr">HR a riposo</Label><Input id="resting_hr" name="resting_hr" type="number" inputMode="numeric" enterKeyHint="next" autoComplete="off" min="30" max="120" placeholder="50" /></div>
        </div>
        <div className="space-y-2"><Label htmlFor="birthdate">Data di nascita</Label><Input id="birthdate" name="birthdate" type="date" autoComplete="bday" /></div>
      </div>

      <div className={step === 2 ? "animate-enter space-y-5" : "hidden"}>
        <div>
          <h1 className="font-display text-display font-bold tracking-tight">Cosa vuoi ottenere?</h1>
          <p className="mt-2 text-body text-muted-foreground">Non serve una gara: puoi anche solo voler correre meglio. Si cambia quando vuoi.</p>
        </div>
        <input type="hidden" name="goal_kind" value={goalKind} />
        <div role="group" aria-label="Tipo di obiettivo" className="space-y-2">
          {GOAL_OPTIONS.map((option) => {
            const selected = goalKind === option.key;
            return (
              <button
                key={option.key}
                type="button"
                aria-pressed={selected}
                onClick={() => setGoalKind(option.key)}
                className={cn(
                  "pressable block w-full rounded-2xl px-4 py-3 text-left",
                  selected ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20" : "bg-muted text-foreground",
                )}
              >
                <span className="block text-body font-semibold">{option.title}</span>
                <span className={cn("block text-caption", selected ? "text-primary-foreground/80" : "text-muted-foreground")}>{option.text}</span>
              </button>
            );
          })}
        </div>

        <div className={goalKind === "none" ? "hidden" : "animate-enter space-y-5"}>
          <div className={goalKind === "race" ? "space-y-2" : "hidden"}><Label id="race_name-label" htmlFor="race_name">Nome gara (opzionale)</Label><TextField id="race_name" aria-labelledby="race_name-label" name="race_name" singleLine enterKeyHint="next" placeholder="Es. Mezza di Roma" /></div>
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
                      "pressable h-9 rounded-full px-4 text-caption font-semibold",
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
                  type="text"
                  inputMode="decimal"
                  pattern={DECIMAL_PATTERN}
                  enterKeyHint="next"
                  autoComplete="off"
                  placeholder="Distanza in km, es. 15"
                  value={distanceKm}
                  onChange={(event) => setDistanceKm(event.target.value)}
                />
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className={goalKind === "race" ? "space-y-2" : "hidden"}><Label htmlFor="race_date">Data gara</Label><Input id="race_date" name="race_date" type="date" /></div>
            <div className={cn("space-y-2", goalKind !== "race" && "col-span-2")}><Label htmlFor="target_time">Tempo target</Label><Input id="target_time" name="target_time" type="text" inputMode="decimal" pattern={DURATION_PATTERN} enterKeyHint="done" autoComplete="off" placeholder="1:45:00" /></div>
          </div>
        </div>
      </div>

      <div className={step === 3 ? "animate-enter space-y-5" : "hidden"}>
        <div>
          <h1 className="font-display text-display font-bold tracking-tight">Attiva il Coach AI</h1>
          <p className="mt-2 text-body text-muted-foreground">Scegli con quale servizio farlo funzionare. Serve una tua chiave; puoi saltare e aggiungerla più tardi, ma senza il coach resta spento.</p>
        </div>
        <input type="hidden" name="ai_provider" value={provider} />
        <Segmented<Provider>
          ariaLabel="Servizio AI"
          value={provider}
          onChange={setProvider}
          options={[{ key: "gemini", label: "Gemini" }, { key: "openrouter", label: "OpenRouter" }]}
        />

        <div className={provider === "gemini" ? "space-y-4" : "hidden"}>
          <p className="text-caption text-muted-foreground">La scelta più semplice: una chiave di Google AI Studio.</p>
          <div className="space-y-2"><Label htmlFor="gemini_key">Chiave Gemini</Label><Input id="gemini_key" name="gemini_key" type="password" autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="done" placeholder="AIza…" /></div>
          <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="inline-block text-sm font-medium text-primary">Crea una chiave in Google AI Studio ↗</a>
        </div>

        <div className={provider === "openrouter" ? "space-y-4" : "hidden"}>
          <p className="text-caption text-muted-foreground">Una sola chiave per centinaia di modelli (Claude, GPT, DeepSeek…), a consumo; alcuni sono gratuiti.</p>
          <div className="space-y-2"><Label htmlFor="openrouter_key">Chiave OpenRouter</Label><Input id="openrouter_key" name="openrouter_key" type="password" autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="next" placeholder="sk-or-…" /></div>
          <div className="space-y-2">
            <Label htmlFor="openrouter_model">Modello</Label>
            {modelSuggestions.length > 0 && (
              <div role="group" aria-label="Modelli suggeriti" className="space-y-2">
                {modelSuggestions.map((model) => {
                  const selected = openRouterModel === model.id;
                  return (
                    <button
                      key={model.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setOpenRouterModel(model.id)}
                      className={cn(
                        "pressable block w-full rounded-xl px-3 py-2 text-left text-caption",
                        selected ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20" : "bg-muted text-foreground",
                      )}
                    >
                      <span className="block font-semibold">{model.title}</span>
                      {model.price && <span className={cn("block", selected ? "text-primary-foreground/80" : "text-muted-foreground")}>{model.price}</span>}
                    </button>
                  );
                })}
              </div>
            )}
            <Input id="openrouter_model" name="openrouter_model" type="text" autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="done" value={openRouterModel} onChange={(event) => setOpenRouterModel(event.target.value)} placeholder="Oppure scrivi l'id, es. openai/gpt-5-mini" />
          </div>
          <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" className="inline-block text-sm font-medium text-primary">Crea una chiave su OpenRouter ↗</a>
        </div>
        <p className="text-caption text-muted-foreground">In seguito puoi cambiare servizio e scegliere modelli diversi per chat e analisi da Impostazioni → Coach.</p>
      </div>

      <div className={step === 4 ? "animate-enter space-y-5" : "hidden"}>
        <div>
          <h1 className="font-display text-display font-bold tracking-tight">Il tuo orologio</h1>
          <p className="mt-2 text-body text-muted-foreground">Con un orologio collegato il coach vede sonno, recupero e frequenza a riposo, e il piano arriva sul polso. Non è obbligatorio.</p>
        </div>
        <div className="space-y-3">
          <div className="rounded-2xl bg-muted p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-body font-semibold">Amazfit</p>
              <span className="rounded-full bg-primary px-2.5 py-0.5 text-caption font-semibold text-primary-foreground">Disponibile</span>
            </div>
            <p className="mt-1 text-caption text-muted-foreground">Balance 2 e Active 3 Premium. Corse e dati salute arrivano da Intervals.icu, e il piano torna sull&apos;orologio come allenamenti guidati. L&apos;app Zepp dedicata aggiunge anche i dati di forma e, sul Balance 2, il widget «Oggi» (richiede la modalità sviluppatore di Zepp).</p>
          </div>
          <div className="rounded-2xl bg-muted p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-body font-semibold">Garmin e altri orologi</p>
              <span className="rounded-full bg-card px-2.5 py-0.5 text-caption font-semibold text-muted-foreground">In lavorazione</span>
            </div>
            <p className="mt-1 text-caption text-muted-foreground">Nel frattempo puoi importare le corse da file FIT o GPX, da qualsiasi orologio.</p>
          </div>
        </div>
        <input type="hidden" name="after" value={after} />
        <div role="group" aria-label="Quando collegarlo" className="flex flex-wrap gap-2">
          {([{ key: "home", label: "Lo collego più tardi" }, { key: "links", label: "Collega ora" }] as const).map((option) => (
            <button
              key={option.key}
              type="button"
              aria-pressed={after === option.key}
              onClick={() => setAfter(option.key)}
              className={cn(
                "pressable h-9 rounded-full px-4 text-caption font-semibold",
                after === option.key ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20" : "bg-muted text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="text-caption text-muted-foreground">Il collegamento si fa da Impostazioni → Collegamenti.</p>
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
            {pending ? "Configuro…" : after === "links" ? "Vai ai collegamenti" : "Entra nell'app"}
          </Button>
        )}
      </div>
    </form>
  );
}

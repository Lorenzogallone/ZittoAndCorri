"use client";

import { useActionState, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Activity, CalendarDays, ChevronLeft, ChevronRight, MessageCircle, Watch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TextField } from "@/components/ui/text-field";
import { Label } from "@/components/ui/label";
import { Segmented } from "@/components/ui/segmented";
import { RunnerMark } from "@/components/runner-mark";
import { LanguageSwitcher } from "@/components/language-switcher";
import { cn } from "@/lib/utils";
import { handleEnterKeyHint } from "@/lib/form-keys";
import { DECIMAL_PATTERN, DURATION_PATTERN } from "@/lib/format";
import { completeOnboarding, type OnboardingState } from "./actions";

const initialState: OnboardingState = {};

// Same distances as the goal forms (app/goals/goal-fields.tsx), in km.
const DISTANCES = [
  { key: "5", km: "5" },
  { key: "10", km: "10" },
  { key: "half", km: "21.0975" },
  { key: "full", km: "42.195" },
  { key: "other", km: "" },
] as const;

type DistanceKey = (typeof DISTANCES)[number]["key"];

const STEPS = 5;

type GoalKind = "race" | "improve" | "none";
type Provider = "gemini" | "openrouter";

const GOAL_KINDS: GoalKind[] = ["race", "improve", "none"];

const INTRO = [
  { icon: MessageCircle, key: "coach" },
  { icon: CalendarDays, key: "plan" },
  { icon: Activity, key: "runs" },
  { icon: Watch, key: "watch" },
] as const;

export interface ModelSuggestion {
  id: string;
  title: string;
  price: string | null;
  free: boolean;
}

export function OnboardingForm({ modelSuggestions }: { modelSuggestions: ModelSuggestion[] }) {
  const t = useTranslations("onboarding");
  const tc = useTranslations("common");
  const [step, setStep] = useState(0);
  const [goalKind, setGoalKind] = useState<GoalKind>("none");
  const [provider, setProvider] = useState<Provider>("gemini");
  const [openRouterModel, setOpenRouterModel] = useState("");
  const [after, setAfter] = useState<"home" | "links">("home");
  const [state, action, pending] = useActionState(completeOnboarding, initialState);
  // Distance stays a single value in km in the `distance_km` field: the
  // pills fill it, "Altro" shows the numeric input.
  const [distanceChoice, setDistanceChoice] = useState<DistanceKey | null>(null);
  const [distanceKm, setDistanceKm] = useState("");
  const otherRef = useRef<HTMLInputElement>(null);

  function chooseDistance(key: DistanceKey, km: string) {
    if (distanceChoice === key) {
      // Second tap: no distance (the goal is optional).
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
            <ChevronLeft /> {tc("back")}
          </Button>
        ) : (
          <span />
        )}
        <p className="eyebrow tabular-nums">{t("stepCounter", { current: step + 1, total: STEPS })}</p>
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
          <h1 className="font-display text-display font-bold tracking-tight">{t("welcome.title")}</h1>
          <p className="mt-2 text-body text-muted-foreground">{t("welcome.intro")}</p>
        </div>
        <ul className="space-y-4">
          {INTRO.map(({ icon: Icon, key }) => (
            <li key={key} className="flex gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-primary"><Icon size={18} aria-hidden="true" /></span>
              <div>
                <p className="text-body font-semibold">{t(`welcome.features.${key}.title`)}</p>
                <p className="text-caption text-muted-foreground">{t(`welcome.features.${key}.text`)}</p>
              </div>
            </li>
          ))}
        </ul>
        <LanguageSwitcher />
      </div>

      <div className={step === 1 ? "animate-enter space-y-5" : "hidden"}>
        <div>
          <h1 className="font-display text-display font-bold tracking-tight">{t("profile.title")}</h1>
          <p className="mt-2 text-body text-muted-foreground">{t("profile.intro")}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2"><Label htmlFor="max_hr">{t("profile.maxHr")}</Label><Input id="max_hr" name="max_hr" type="number" inputMode="numeric" enterKeyHint="next" autoComplete="off" min="100" max="240" placeholder="190" /></div>
          <div className="space-y-2"><Label htmlFor="resting_hr">{t("profile.restingHr")}</Label><Input id="resting_hr" name="resting_hr" type="number" inputMode="numeric" enterKeyHint="next" autoComplete="off" min="30" max="120" placeholder="50" /></div>
        </div>
        <div className="space-y-2"><Label htmlFor="birthdate">{t("profile.birthdate")}</Label><Input id="birthdate" name="birthdate" type="date" autoComplete="bday" /></div>
      </div>

      <div className={step === 2 ? "animate-enter space-y-5" : "hidden"}>
        <div>
          <h1 className="font-display text-display font-bold tracking-tight">{t("goal.title")}</h1>
          <p className="mt-2 text-body text-muted-foreground">{t("goal.intro")}</p>
        </div>
        <input type="hidden" name="goal_kind" value={goalKind} />
        <div role="group" aria-label={t("goal.groupLabel")} className="space-y-2">
          {GOAL_KINDS.map((kind) => {
            const selected = goalKind === kind;
            return (
              <button
                key={kind}
                type="button"
                aria-pressed={selected}
                onClick={() => setGoalKind(kind)}
                className={cn(
                  "pressable block w-full rounded-2xl px-4 py-3 text-left",
                  selected ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20" : "bg-muted text-foreground",
                )}
              >
                <span className="block text-body font-semibold">{t(`goal.kinds.${kind}.title`)}</span>
                <span className={cn("block text-caption", selected ? "text-primary-foreground/80" : "text-muted-foreground")}>{t(`goal.kinds.${kind}.text`)}</span>
              </button>
            );
          })}
        </div>

        <div className={goalKind === "none" ? "hidden" : "animate-enter space-y-5"}>
          <div className={goalKind === "race" ? "space-y-2" : "hidden"}><Label id="race_name-label" htmlFor="race_name">{t("goal.raceName")}</Label><TextField id="race_name" aria-labelledby="race_name-label" name="race_name" singleLine enterKeyHint="next" placeholder={t("goal.raceNamePlaceholder")} /></div>
          <div className="space-y-2">
            <Label id="distance_label">{t("goal.distance")}</Label>
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
                    {t(`goal.distances.${option.key}`)}
                  </button>
                );
              })}
            </div>
            {distanceChoice === "other" && (
              <div className="animate-enter pt-1">
                <Label htmlFor="distance_other" className="sr-only">{t("goal.distanceOtherLabel")}</Label>
                <Input
                  ref={otherRef}
                  id="distance_other"
                  type="text"
                  inputMode="decimal"
                  pattern={DECIMAL_PATTERN}
                  enterKeyHint="next"
                  autoComplete="off"
                  placeholder={t("goal.distanceOtherPlaceholder")}
                  value={distanceKm}
                  onChange={(event) => setDistanceKm(event.target.value)}
                />
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className={goalKind === "race" ? "space-y-2" : "hidden"}><Label htmlFor="race_date">{t("goal.raceDate")}</Label><Input id="race_date" name="race_date" type="date" /></div>
            <div className={cn("space-y-2", goalKind !== "race" && "col-span-2")}><Label htmlFor="target_time">{t("goal.targetTime")}</Label><Input id="target_time" name="target_time" type="text" inputMode="decimal" pattern={DURATION_PATTERN} enterKeyHint="done" autoComplete="off" placeholder="1:45:00" /></div>
          </div>
        </div>
      </div>

      <div className={step === 3 ? "animate-enter space-y-5" : "hidden"}>
        <div>
          <h1 className="font-display text-display font-bold tracking-tight">{t("ai.title")}</h1>
          <p className="mt-2 text-body text-muted-foreground">{t("ai.intro")}</p>
        </div>
        <input type="hidden" name="ai_provider" value={provider} />
        <Segmented<Provider>
          ariaLabel={t("ai.serviceLabel")}
          value={provider}
          onChange={setProvider}
          options={[{ key: "gemini", label: "Gemini" }, { key: "openrouter", label: "OpenRouter" }]}
        />

        <div className={provider === "gemini" ? "space-y-4" : "hidden"}>
          <p className="text-caption text-muted-foreground">{t("ai.geminiHint")}</p>
          <div className="space-y-2"><Label htmlFor="gemini_key">{t("ai.geminiKey")}</Label><Input id="gemini_key" name="gemini_key" type="password" autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="done" placeholder="AIza…" /></div>
          <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="inline-block text-sm font-medium text-primary">{t("ai.geminiLink")}</a>
        </div>

        <div className={provider === "openrouter" ? "space-y-4" : "hidden"}>
          <p className="text-caption text-muted-foreground">{t("ai.openrouterHint")}</p>
          <div className="space-y-2"><Label htmlFor="openrouter_key">{t("ai.openrouterKey")}</Label><Input id="openrouter_key" name="openrouter_key" type="password" autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="next" placeholder="sk-or-…" /></div>
          <div className="space-y-2">
            <Label htmlFor="openrouter_model">{t("ai.model")}</Label>
            {modelSuggestions.length > 0 && (
              <div role="group" aria-label={t("ai.suggestedModels")} className="space-y-2">
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
            <Input id="openrouter_model" name="openrouter_model" type="text" autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="done" value={openRouterModel} onChange={(event) => setOpenRouterModel(event.target.value)} placeholder={t("ai.modelPlaceholder")} />
          </div>
          <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" className="inline-block text-sm font-medium text-primary">{t("ai.openrouterLink")}</a>
        </div>
        <p className="text-caption text-muted-foreground">{t("ai.later")}</p>
      </div>

      <div className={step === 4 ? "animate-enter space-y-5" : "hidden"}>
        <div>
          <h1 className="font-display text-display font-bold tracking-tight">{t("watch.title")}</h1>
          <p className="mt-2 text-body text-muted-foreground">{t("watch.intro")}</p>
        </div>
        <div className="space-y-3">
          <div className="rounded-2xl bg-muted p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-body font-semibold">{t("watch.amazfit.name")}</p>
              <span className="rounded-full bg-primary px-2.5 py-0.5 text-caption font-semibold text-primary-foreground">{t("watch.amazfit.badge")}</span>
            </div>
            <p className="mt-1 text-caption text-muted-foreground">{t("watch.amazfit.text")}</p>
          </div>
          <div className="rounded-2xl bg-muted p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-body font-semibold">{t("watch.others.name")}</p>
              <span className="rounded-full bg-card px-2.5 py-0.5 text-caption font-semibold text-muted-foreground">{t("watch.others.badge")}</span>
            </div>
            <p className="mt-1 text-caption text-muted-foreground">{t("watch.others.text")}</p>
          </div>
        </div>
        <input type="hidden" name="after" value={after} />
        <div role="group" aria-label={t("watch.whenLabel")} className="flex flex-wrap gap-2">
          {([{ key: "home", label: t("watch.later") }, { key: "links", label: t("watch.now") }] as const).map((option) => (
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
        <p className="text-caption text-muted-foreground">{t("watch.where")}</p>
      </div>

      {state.error && <p role="alert" className="mt-5 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{state.error}</p>}

      <div className="mt-auto pt-10">
        {/* Different keys: without them, React reuses the same <button> and the tap on
            "Continua" of step 2, now type="submit", would submit the form. */}
        {step < STEPS - 1 ? (
          <Button key="next" type="button" size="lg" className="w-full" onClick={() => setStep((value) => value + 1)}>
            {tc("continue")} <ChevronRight />
          </Button>
        ) : (
          <Button key="submit" type="submit" size="lg" className="w-full" disabled={pending}>
            {pending ? t("submit.pending") : after === "links" ? t("submit.goToLinks") : t("submit.enter")}
          </Button>
        )}
      </div>
    </form>
  );
}

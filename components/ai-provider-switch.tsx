"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { chooseAiProvider } from "@/app/settings/actions";

export interface AiSwitchState {
  active: "gemini" | "openrouter" | null;
  gemini: { configured: boolean; modelLabel: string | null };
  openrouter: { configured: boolean; modelLabel: string | null } | null;
}

const NAMES = { gemini: "Gemini", openrouter: "OpenRouter" } as const;

/** Chi risponde in chat, e il cambio rapido tra Gemini e OpenRouter. */
export function useAiSwitch(initial: AiSwitchState) {
  const [state, setState] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const choose = (provider: "gemini" | "openrouter") => {
    if (provider === state.active || pending) return;
    const previous = state;
    setState({ ...state, active: provider });
    setError(null);
    startTransition(async () => {
      const result = await chooseAiProvider(provider);
      if (result.error) {
        setState(previous);
        setError(result.error);
      }
    });
  };
  return { state, choose, pending, error };
}

export function AiModelLine({ state }: { state: AiSwitchState }) {
  if (!state.active) return null;
  const label = state.active === "gemini" ? state.gemini.modelLabel : state.openrouter?.modelLabel;
  // Con l'interruttore visibile il provider si vede già: basta il modello.
  const both = state.gemini.configured && !!state.openrouter?.configured;
  return (
    <p className="truncate text-micro leading-tight text-muted-foreground">
      {label}{both ? "" : ` · ${NAMES[state.active]}`}
    </p>
  );
}

export function AiProviderToggle({ state, choose, pending }: { state: AiSwitchState; choose: (p: "gemini" | "openrouter") => void; pending: boolean }) {
  const both = state.gemini.configured && !!state.openrouter?.configured;
  if (!both) {
    return state.active ? (
      <Link href="/settings?tab=coach" className="shrink-0 text-micro font-medium text-primary" title="Aggiungi o cambia modello">
        Modello
      </Link>
    ) : null;
  }
  return (
    <div className="inline-flex shrink-0 rounded-lg bg-muted p-0.5 text-micro font-medium" role="radiogroup" aria-label="Chi risponde">
      {(["gemini", "openrouter"] as const).map((provider) => (
        <button
          key={provider}
          type="button"
          role="radio"
          aria-checked={state.active === provider}
          disabled={pending}
          onClick={() => choose(provider)}
          className={cn(
            "rounded-md px-2 py-1 transition-colors",
            state.active === provider ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
          )}
        >
          {NAMES[provider]}
        </button>
      ))}
    </div>
  );
}

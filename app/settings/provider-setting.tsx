"use client";

import { AiModelLine, AiProviderToggle, useAiSwitch, type AiSwitchState } from "@/components/ai-provider-switch";

/** Chi risponde in chat e scrive piani e analisi: lo stesso interruttore della chat. */
export function ProviderSetting({ initial }: { initial: AiSwitchState }) {
  const { state, choose, pending, error } = useAiSwitch(initial);
  const both = state.gemini.configured && !!state.openrouter?.configured;
  return (
    <div className="py-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">{state.active ? "In uso" : "Nessuna chiave configurata"}</p>
          <AiModelLine state={state} />
        </div>
        {both && <AiProviderToggle state={state} choose={choose} pending={pending} />}
      </div>
      {!both && state.active && (
        <p className="mt-2 text-xs text-muted-foreground">Aggiungi anche l&apos;altra chiave per passare dall&apos;una all&apos;altra, anche dalla chat.</p>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}

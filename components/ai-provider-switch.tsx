export interface AiSwitchState {
  active: "gemini" | "openrouter" | null;
  gemini: { configured: boolean; modelLabel: string | null };
  openrouter: { configured: boolean; modelLabel: string | null } | null;
}

const NAMES = { gemini: "Gemini", openrouter: "OpenRouter" } as const;

/** Chi risponde in chat: modello e provider. Si cambia da Impostazioni → Coach. */
export function AiModelLine({ state }: { state: AiSwitchState }) {
  if (!state.active) return null;
  const label = state.active === "gemini" ? state.gemini.modelLabel : state.openrouter?.modelLabel;
  return (
    <p className="truncate text-micro leading-tight text-muted-foreground">
      {[label, NAMES[state.active]].filter(Boolean).join(" · ")}
    </p>
  );
}

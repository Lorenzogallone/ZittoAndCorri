"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { startEvaluation } from "@/app/activities/ai-actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AiThinkingOverlay } from "@/components/ai-thinking-overlay";
import { CollapsibleSection } from "@/components/collapsible-section";
import { useAiJob } from "@/lib/use-ai-job";
import type { Evaluation } from "@/lib/types";

interface Props {
  activityId: string;
  initialNotes: string | null;
  evaluation: Pick<Evaluation, "summary" | "details" | "created_at"> | null;
  initialAnalyzing?: boolean;
  initialFailed?: boolean;
  keyConfigured?: boolean;
}

export function ActivityEvaluation({
  activityId,
  initialNotes,
  evaluation,
  initialAnalyzing = false,
  initialFailed = false,
  keyConfigured = true,
}: Props) {
  // Chiave per-corsa: riprende il polling se la PWA si ricarica durante
  // l'attesa e, dopo il reload post-analisi, riporta lo scroll dov'era.
  const { pending, error, start } = useAiJob(`eval:${activityId}`);

  const details = evaluation?.details ?? [];

  return (
    <CollapsibleSection
      className="border-primary/10 bg-primary/[0.04]"
      title={(
        <span className="flex items-center gap-2 text-primary">
          <Sparkles size={16} /> Coach AI
        </span>
      )}
    >
      {evaluation?.summary && (
        <div className="mb-4">
          <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
            {evaluation.summary}
          </p>
          {details.length > 0 && (
            <div className="mt-4 rounded-xl border border-border/60 bg-background/35 px-4 py-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Dettagli aggiuntivi
              </p>
              <ul className="flex list-disc flex-col gap-1.5 pl-4 text-sm text-foreground/90 marker:text-primary">
                {details.map((detail, index) => (
                  <li key={`${detail}-${index}`}>{detail}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {initialAnalyzing && !evaluation?.summary && !pending && (
        <p className="mb-4 text-sm text-muted-foreground">
          Analisi automatica in corso. Puoi continuare a usare l&apos;app: il feedback apparirà anche nella chat.
        </p>
      )}

      {!keyConfigured && (
        <Link href="/settings?focus=gemini#gemini-integration" onClick={() => window.sessionStorage.setItem("settings-focus", "gemini")} className="mb-4 block rounded-xl bg-primary/10 px-4 py-3 text-center text-sm font-medium text-primary">
          Configura la chiave Gemini per ricevere il feedback AI
        </Link>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          start(() => startEvaluation(fd));
        }}
        className="flex flex-col gap-2.5"
      >
        <input type="hidden" name="activity_id" value={activityId} />
        <label
          htmlFor="ai-notes"
          className="text-xs text-muted-foreground uppercase tracking-wider"
        >
          {evaluation ? "Aggiungi altri dettagli (opzionale)" : "Note per il coach (opzionali)"}
        </label>
        <Textarea
          id="ai-notes"
          name="notes"
          rows={3}
          defaultValue={evaluation ? "" : initialNotes ?? ""}
          placeholder="Es. gambe pesanti, ho saltato la colazione, fastidio al polpaccio…"
        />

        {error && (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        )}

        <Button type="submit" disabled={pending || !keyConfigured} variant="outline" className="w-full">
          {pending
            ? "Valuto…"
            : evaluation
              ? "Rivaluta corsa"
              : initialFailed
                ? "Riprova analisi"
                : "Valuta corsa"}
        </Button>
        {!evaluation && !error && (
          <p className="text-xs text-muted-foreground text-center">
            Il coach trasformerà il commento in dettagli brevi e ordinati.
          </p>
        )}
      </form>

      {/* AI Thinking Overlay */}
      <AiThinkingOverlay pending={pending} variant="evaluation" />
    </CollapsibleSection>
  );
}

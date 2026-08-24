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
  evaluation: Pick<Evaluation, "summary" | "created_at"> | null;
  initialAnalyzing?: boolean;
  initialFailed?: boolean;
  initialError?: string | null;
  keyConfigured?: boolean;
}

export function ActivityEvaluation({
  activityId,
  initialNotes,
  evaluation,
  initialAnalyzing = false,
  initialFailed = false,
  initialError = null,
  keyConfigured = true,
}: Props) {
  // Chiave per-corsa: riprende il polling se la PWA si ricarica durante
  // l'attesa e, dopo il reload post-analisi, riporta lo scroll dov'era.
  const { pending, error, start } = useAiJob(`eval:${activityId}`);
  const displayedError = error ?? initialError;
  // Un errore terminale ricevuto dal polling deve prevalere sul valore server
  // iniziale `initialAnalyzing`, che può restare true fino al prossimo refresh.
  const isAnalyzing = pending || (initialAnalyzing && !displayedError);

  return (
    <CollapsibleSection
      className="border-primary/10 bg-primary/[0.04]"
      title={(
        <span className="flex items-center gap-2 text-primary">
          <Sparkles size={16} /> Coach AI
        </span>
      )}
    >
      {evaluation?.summary && !isAnalyzing && (
        <div className="mb-4">
          <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
            {evaluation.summary}
          </p>
        </div>
      )}

      {!keyConfigured && !isAnalyzing && (
        <Link href="/settings?focus=gemini#gemini-integration" onClick={() => window.sessionStorage.setItem("settings-focus", "gemini")} className="mb-4 block rounded-xl bg-primary/10 px-4 py-3 text-center text-sm font-medium text-primary">
          Configura la chiave Gemini per ricevere il feedback AI
        </Link>
      )}

      {displayedError && !isAnalyzing && (
        <div className="mb-3 border-l-2 border-destructive pl-3" role="alert">
          <p className="text-sm font-medium text-destructive">{displayedError}</p>
          {/quota/i.test(displayedError) && (
            <p className="mt-1 text-xs text-muted-foreground">
              Attendi il ripristino del limite gratuito prima di riprovare.
            </p>
          )}
        </div>
      )}

      {!isAnalyzing && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const fd = new FormData(form);
            form.reset();
            start(() => startEvaluation(fd));
          }}
          className="flex flex-col gap-2.5"
        >
          <input type="hidden" name="activity_id" value={activityId} />
          <label
            htmlFor="ai-notes"
            className="text-xs font-medium text-muted-foreground"
          >
            Note per il coach
          </label>
          <Textarea
            id="ai-notes"
            name="notes"
            rows={3}
            defaultValue={evaluation ? "" : initialNotes ?? ""}
            placeholder="Gambe pesanti, poco sonno, fastidio al polpaccio…"
          />

          <Button type="submit" disabled={!keyConfigured} variant="outline" className="w-full">
            {evaluation
              ? "Rivaluta corsa"
              : initialFailed
                ? "Riprova analisi"
                : "Valuta corsa"}
          </Button>
        </form>
      )}

      <AiThinkingOverlay pending={isAnalyzing} variant="evaluation" />
    </CollapsibleSection>
  );
}

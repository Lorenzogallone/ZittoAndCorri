"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { startEvaluation } from "@/app/activities/ai-actions";
import type { AiJobStatus } from "@/app/actions/ai-jobs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AiThinkingOverlay } from "@/components/ai-thinking-overlay";
import { useAiJob } from "@/lib/use-ai-job";
import type { Evaluation } from "@/lib/types";
import { AiCost } from "@/components/ai-cost";
import { readUsage } from "@/lib/ai/usage";

interface Props {
  activityId: string;
  initialNotes: string | null;
  evaluation: Pick<Evaluation, "summary" | "details" | "created_at" | "ai_usage"> | null;
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
  const [displayedEvaluation, setDisplayedEvaluation] = useState(evaluation);
  const usage = readUsage(displayedEvaluation?.ai_usage);
  const router = useRouter();
  const showEvaluationResult = useCallback((status: AiJobStatus) => {
    if (!status.evaluationResult) throw new Error("Risultato valutazione mancante");
    setDisplayedEvaluation(status.evaluationResult);
    // La valutazione può aver riletto le ripetute dalla nota: aggiorna la pagina.
    router.refresh();
  }, [router]);
  // La chiave per-corsa permette di riprendere il polling se iOS sospende la
  // PWA, mentre onDone aggiorna questa sezione senza ricaricare la pagina.
  const { pending, done, error, start } = useAiJob(`eval:${activityId}`, {
    onDone: showEvaluationResult,
  });
  const displayedError = error ?? initialError;
  // Un errore terminale ricevuto dal polling deve prevalere sul valore server
  // iniziale `initialAnalyzing`, che può restare true fino al prossimo refresh.
  const isAnalyzing = pending || (initialAnalyzing && !done && !displayedError);
  // Con un'analisi già presente la nota resta nascosta finché non serve.
  const [showForm, setShowForm] = useState(false);
  const formVisible = !displayedEvaluation?.summary || showForm;
  const sectionRef = useRef<HTMLElement>(null);

  // "#nota" (es. dalla scheda Ripetute): apre il campo e ci porta lì.
  useEffect(() => {
    const open = () => {
      if (window.location.hash !== "#nota") return;
      setShowForm(true);
      requestAnimationFrame(() => {
        sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        document.getElementById("ai-notes")?.focus({ preventScroll: true });
      });
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, []);

  return (
    <section id="nota" ref={sectionRef} className="surface scroll-mt-4 p-5">
      <h2 className="mb-3 flex items-center gap-2 text-[15px] font-semibold">
        <Sparkles size={16} className="text-primary" /> Il commento del coach
      </h2>

      {displayedEvaluation?.summary && !isAnalyzing && (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{displayedEvaluation.summary}</p>
      )}
      {(displayedEvaluation?.details?.length ?? 0) > 0 && !isAnalyzing && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {displayedEvaluation!.details!.map((detail, index) => (
            <li key={`${detail}-${index}`} className="rounded-full bg-muted px-2.5 py-1 text-xs">{detail}</li>
          ))}
        </ul>
      )}
      {usage && displayedEvaluation?.summary && !isAnalyzing && (
        <AiCost usage={usage} part="total" prefix="Costo dell'analisi" className="mt-3" />
      )}

      {!keyConfigured && !isAnalyzing && (
        <Link href="/settings?tab=coach" className="mt-3 block rounded-xl bg-primary/10 px-4 py-3 text-center text-sm font-medium text-primary">
          Aggiungi una chiave Gemini o OpenRouter per ricevere il commento
        </Link>
      )}

      {displayedError && !isAnalyzing && (
        <div className="mt-3 border-l-2 border-destructive pl-3" role="alert">
          <p className="text-sm font-medium text-destructive">{displayedError}</p>
          {/quota/i.test(displayedError) && (
            <p className="mt-1 text-xs text-muted-foreground">
              Attendi il ripristino del limite gratuito prima di riprovare.
            </p>
          )}
        </div>
      )}

      {!isAnalyzing && keyConfigured && !formVisible && (
        <button type="button" onClick={() => setShowForm(true)} className="mt-4 text-sm font-medium text-primary">
          Aggiungi una nota e rivaluta
        </button>
      )}

      {!isAnalyzing && formVisible && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const fd = new FormData(form);
            form.reset();
            setShowForm(false);
            start(() => startEvaluation(fd));
          }}
          className="mt-4 flex flex-col gap-2.5"
        >
          <input type="hidden" name="activity_id" value={activityId} />
          <label htmlFor="ai-notes" className="text-xs font-medium text-muted-foreground">
            Come è andata?
          </label>
          <Textarea
            id="ai-notes"
            name="notes"
            rows={3}
            defaultValue={displayedEvaluation ? "" : initialNotes ?? ""}
            placeholder="Gambe pesanti, caldo… e se hai fatto ripetute, com'erano: 3 × (3' forte + 1' jog + 1' sprint)"
          />
          <Button type="submit" disabled={!keyConfigured} variant="outline" className="w-full">
            {displayedEvaluation ? "Rivaluta" : initialFailed ? "Riprova" : "Chiedi al coach"}
          </Button>
        </form>
      )}

      <AiThinkingOverlay pending={isAnalyzing} variant="evaluation" />
    </section>
  );
}

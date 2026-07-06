"use client";

import { Sparkles } from "lucide-react";
import { startPlanGeneration } from "@/app/plan/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AiThinkingOverlay } from "@/components/ai-thinking-overlay";
import { useAiJob } from "@/lib/use-ai-job";

interface Props {
  /** created_at dell'ultima review: cambia quando il nuovo piano è arrivato,
   *  permettendo il refresh soft (niente reload) anche in PWA standalone. */
  latestReviewAt: string | null;
}

export function PlanGenerator({ latestReviewAt }: Props) {
  // Chiave stabile: riprende il polling se la PWA si ricarica durante l'attesa.
  const { pending, done, error, start } = useAiJob("plan", latestReviewAt);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-card p-5">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/[0.07] to-transparent" />
      <div className="relative flex flex-col gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15">
            <Sparkles size={18} className="text-primary" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              Coach AI
            </h2>
            <p className="text-xs text-muted-foreground">
              Genera il piano delle prossime 2 settimane
            </p>
          </div>
        </div>

        <p className="text-xs leading-relaxed text-muted-foreground">
          Crea gli allenamenti in base a obiettivo, corse fatte e aderenza.
          Sovrascrive solo i workout ancora pianificati. Aggiungi qui i tuoi
          vincoli: verranno rispettati.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            start(() => startPlanGeneration(fd));
          }}
          className="flex flex-col gap-2.5"
        >
          <Textarea
            name="comments"
            rows={3}
            placeholder="Vincoli o preferenze, es. nel weekend non posso correre; max 4 uscite a settimana…"
            disabled={pending}
          />

          {error && (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          )}
          {done && !pending && (
            <p className="text-emerald-600 dark:text-emerald-400 text-sm">
              Piano aggiornato! La review è qui sotto.
            </p>
          )}

          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Genero il piano…" : "Genera piano 2 settimane"}
          </Button>
        </form>

        {/* AI Thinking Overlay */}
        <AiThinkingOverlay pending={pending} variant="plan" />
      </div>
    </div>
  );
}


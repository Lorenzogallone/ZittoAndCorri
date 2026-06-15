"use client";

import { Sparkles } from "lucide-react";
import { startEvaluation } from "@/app/activities/ai-actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AiThinkingOverlay } from "@/components/ai-thinking-overlay";
import { useAiJob } from "@/lib/use-ai-job";
import type { Evaluation } from "@/lib/types";

interface FlagMeta {
  label: string;
  tone: "good" | "warn" | "bad";
}

const FLAG_META: Record<string, FlagMeta> = {
  good_progress: { label: "Buoni progressi", tone: "good" },
  on_track: { label: "In linea col piano", tone: "good" },
  overreaching: { label: "Sovraccarico", tone: "warn" },
  easy_too_fast: { label: "Easy troppo veloce", tone: "warn" },
  injury_risk: { label: "Rischio infortunio", tone: "bad" },
};

const TONE_CLASSES: Record<FlagMeta["tone"], string> = {
  good: "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400",
  warn: "bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400",
  bad: "bg-red-500/10 text-red-600 dark:bg-red-500/20 dark:text-red-400",
};

interface Props {
  activityId: string;
  initialNotes: string | null;
  evaluation: Pick<Evaluation, "summary" | "flags" | "created_at"> | null;
}

export function ActivityEvaluation({
  activityId,
  initialNotes,
  evaluation,
}: Props) {
  const { pending, error, start } = useAiJob();

  const activeFlags = evaluation?.flags
    ? Object.entries(evaluation.flags).filter(([, v]) => v === true)
    : [];

  return (
    <div className="rounded-2xl border border-primary/10 bg-primary/[0.04] p-5 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={16} className="text-primary" />
        <h2 className="text-sm font-semibold text-primary">Coach AI</h2>
      </div>

      {evaluation?.summary && (
        <div className="mb-4">
          <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
            {evaluation.summary}
          </p>
          {activeFlags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {activeFlags.map(([key]) => {
                const meta = FLAG_META[key];
                return (
                  <span
                    key={key}
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      meta ? TONE_CLASSES[meta.tone] : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {meta?.label ?? key}
                  </span>
                );
              })}
            </div>
          )}
        </div>
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
          Note per il coach (opzionali)
        </label>
        <Textarea
          id="ai-notes"
          name="notes"
          rows={3}
          defaultValue={initialNotes ?? ""}
          placeholder="Es. gambe pesanti, ho saltato la colazione, fastidio al polpaccio…"
        />

        {error && (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        )}

        <Button type="submit" disabled={pending} variant="outline" className="w-full">
          {pending
            ? "Valuto…"
            : evaluation
              ? "Rivaluta corsa"
              : "Valuta corsa"}
        </Button>
        {!evaluation && !error && (
          <p className="text-xs text-muted-foreground text-center">
            Aggiungi le note e chiedi al coach una valutazione della corsa.
          </p>
        )}
      </form>

      {/* AI Thinking Overlay */}
      <AiThinkingOverlay pending={pending} variant="evaluation" />
    </div>
  );
}

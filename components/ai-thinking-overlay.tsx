"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

const PLAN_STEPS = [
  "Analizzo il tuo storico corse…",
  "Valuto obiettivi e aderenza…",
  "Costruisco il piano personalizzato…",
  "Ottimizzazione finale…",
];

const EVALUATION_STEPS = [
  "Analizzo i dati della corsa…",
  "Confronto col piano e obiettivi…",
  "Genero valutazione personalizzata…",
  "Preparo i suggerimenti…",
];

interface AiThinkingOverlayProps {
  pending: boolean;
  variant: "plan" | "evaluation";
}

export function AiThinkingOverlay({ pending, variant }: AiThinkingOverlayProps) {
  const [visibleSteps, setVisibleSteps] = useState(pending ? 1 : 0);
  const [elapsed, setElapsed] = useState(0);
  const steps = variant === "plan" ? PLAN_STEPS : EVALUATION_STEPS;

  // Reset quando pending cambia: adattamento dello stato durante il render
  // (niente setState dentro un effect → niente render a cascata).
  const [prevPending, setPrevPending] = useState(pending);
  if (pending !== prevPending) {
    setPrevPending(pending);
    setVisibleSteps(pending ? 1 : 0);
    setElapsed(0);
  }

  // Reveal steps progressively
  useEffect(() => {
    if (!pending) return;

    const stepDelays = [0, 2000, 4500, 7000]; // ms delay for each step to appear
    const timers: ReturnType<typeof setTimeout>[] = [];

    stepDelays.forEach((delay, idx) => {
      if (idx === 0) return; // first step is already shown
      const t = setTimeout(() => {
        setVisibleSteps((prev) => Math.max(prev, idx + 1));
      }, delay);
      timers.push(t);
    });

    return () => timers.forEach(clearTimeout);
  }, [pending]);

  // Elapsed time counter
  useEffect(() => {
    if (!pending) return;
    const interval = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [pending]);

  if (!pending) return null;

  return (
    <div className="ai-thinking-overlay mt-3 rounded-xl border border-primary/20 bg-card/80 p-4 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-3">
        <div className="ai-sparkle-icon flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15">
          <Sparkles size={16} className="text-primary" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">
              Il Coach sta pensando
            </span>
            <span className="ai-thinking-dots text-primary font-bold">
              <span>.</span><span>.</span><span>.</span>
            </span>
          </div>
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {elapsed}s
          </span>
        </div>
      </div>

      {/* Shimmer progress bar */}
      <div className="ai-shimmer-bar h-0.5 w-full rounded-full mb-3" />

      {/* Thinking steps */}
      <div className="flex flex-col gap-2">
        {steps.slice(0, visibleSteps).map((step, idx) => {
          const isLatest = idx === visibleSteps - 1;
          return (
            <div
              key={idx}
              className="ai-thinking-step flex items-start gap-2.5"
              style={{ animationDelay: "0ms" }}
            >
              {/* Step indicator */}
              <div className="mt-0.5 shrink-0">
                {isLatest ? (
                  <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                ) : (
                  <div className="h-2 w-2 rounded-full bg-primary/40" />
                )}
              </div>
              <span
                className={`text-xs leading-relaxed ${
                  isLatest
                    ? "text-foreground font-medium"
                    : "text-muted-foreground"
                }`}
              >
                {step}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

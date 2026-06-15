"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

// Più step "di pensiero", distribuiti su ~45s per coprire la durata media reale
// della chiamata AI (~50s) senza che l'utente resti su un messaggio fermo.
const PLAN_STEPS = [
  "Analizzo il tuo storico corse…",
  "Valuto carico, aderenza e recupero…",
  "Rivedo gli obiettivi attivi…",
  "Costruisco il piano delle 2 settimane…",
  "Bilancio intensità e volumi…",
  "Rifinisco e do gli ultimi ritocchi…",
];

const EVALUATION_STEPS = [
  "Analizzo i dati della corsa…",
  "Confronto passo, FC e dislivello…",
  "Incrocio col piano e gli obiettivi…",
  "Valuto fatica e qualità dell'allenamento…",
  "Preparo i suggerimenti del coach…",
  "Rifinisco la valutazione…",
];

// Comparsa progressiva degli step, spalmata fino a ~40s (l'ultimo resta finché
// il job non finisce). Indicizzata per step: stepDelays[i] = ms di comparsa.
const STEP_DELAYS_MS = [0, 4_000, 10_000, 18_000, 28_000, 40_000];

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

    const timers: ReturnType<typeof setTimeout>[] = [];

    STEP_DELAYS_MS.forEach((delay, idx) => {
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

      {/* Nota rassicurante sulla coda lunga: la generazione richiede in media
          ~50s, qui evitiamo che l'utente pensi che si sia bloccato. */}
      <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
        {elapsed < 45
          ? "Di solito ci vogliono circa 50 secondi: puoi lasciare l'app aperta."
          : "Ci siamo quasi, ancora un istante…"}
      </p>
    </div>
  );
}

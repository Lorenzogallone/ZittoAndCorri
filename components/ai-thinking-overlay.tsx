"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

// Step "di pensiero" che si accumulano durante i ~50s medi della chiamata AI.
// Ogni step compare ogni ~3-4s nei primi 30s (frequente, sembra vivo), poi
// rallenta leggermente. Gli step restano visibili man mano che si aggiungono.
const PLAN_STEPS = [
  "Leggo il tuo storico corse…",
  "Misuro carico e fatica accumulata…",
  "Calcolo aderenza alle ultime settimane…",
  "Rivedo l'obiettivo attivo…",
  "Valuto il tuo livello di forma attuale…",
  "Stimo il volume sostenibile…",
  "Distribuisco intensità nella settimana…",
  "Costruisco gli allenamenti chiave…",
  "Aggiungo corse di recupero e facili…",
  "Bilancio lunedì-domenica…",
  "Inserisco le note e i vincoli richiesti…",
  "Controllo la progressione del piano…",
  "Rifinisco i dettagli finali…",
];

const EVALUATION_STEPS = [
  "Leggo i dati della corsa…",
  "Analizzo il passo…",
  "Analizzo la frequenza cardiaca…",
  "Confronto con il piano del giorno…",
  "Verifico l'aderenza agli obiettivi…",
  "Stimo l'effort percepito…",
  "Valuto il dislivello e le condizioni…",
  "Individuo punti di forza…",
  "Individuo punti da migliorare…",
  "Verifico rischi di sovraccarico…",
  "Incrocio con le ultime settimane…",
  "Preparo i suggerimenti del coach…",
  "Rifinisco la valutazione…",
];

// Uno step nuovo ogni ~3-4s per i primi 30s, poi ogni ~5s fino a ~55s.
// L'array ha tanti elementi quanti PLAN_STEPS / EVALUATION_STEPS.
const STEP_DELAYS_MS = [
  0, 3_000, 6_000, 9_500, 13_000, 16_500,
  20_000, 24_000, 28_000, 33_000, 38_000, 44_000, 51_000,
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

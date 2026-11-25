"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

// "Thinking" steps that accumulate during the ~50s average of the AI call.
// Each step appears every ~3-4s in the first 30s (frequent, feels alive), then
// slows slightly. Steps stay visible as they are added.
// Keys in messages/it/coach.json (thinking.plan.* and thinking.evaluation.*).
const PLAN_STEPS = [
  "readHistory",
  "measureLoad",
  "adherence",
  "reviewGoal",
  "assessForm",
  "estimateVolume",
  "distributeIntensity",
  "buildKeyWorkouts",
  "addEasyRuns",
  "balanceWeek",
  "addNotes",
  "checkProgression",
  "finalDetails",
] as const;

const EVALUATION_STEPS = [
  "readData",
  "pace",
  "heartRate",
  "comparePlan",
  "adherence",
  "effort",
  "elevation",
  "strengths",
  "improvements",
  "overloadRisk",
  "recentWeeks",
  "coachTips",
  "finalize",
] as const;

// A new step every ~3-4s for the first 30s, then every ~5s up to ~55s.
// The array has as many elements as PLAN_STEPS / EVALUATION_STEPS.
const STEP_DELAYS_MS = [
  0, 3_000, 6_000, 9_500, 13_000, 16_500,
  20_000, 24_000, 28_000, 33_000, 38_000, 44_000, 51_000,
];

interface AiThinkingOverlayProps {
  pending: boolean;
  variant: "plan" | "evaluation";
}

export function AiThinkingOverlay({ pending, variant }: AiThinkingOverlayProps) {
  const t = useTranslations("coach.thinking");
  const [visibleSteps, setVisibleSteps] = useState(pending ? 1 : 0);
  const [elapsed, setElapsed] = useState(0);
  const steps = (variant === "plan" ? PLAN_STEPS : EVALUATION_STEPS).map((key) => t(`${variant}.${key}`));

  // Reset when pending changes: adjusting state during render
  // (no setState inside an effect → no cascading renders).
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

  if (variant === "evaluation") {
    return (
      <div className="mt-1 py-2" aria-live="polite">
        <div className="mb-3 flex items-center gap-2 text-primary">
          <Sparkles size={15} className="animate-pulse" />
          <span className="text-sm font-semibold">{t("analyzing")}</span>
        </div>
        <div className="ai-shimmer-bar mb-3 h-0.5 w-full rounded-full" />
        <p className="text-xs text-muted-foreground">
          {steps[Math.max(0, visibleSteps - 1)]}
        </p>
      </div>
    );
  }

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
              {t("thinking")}
            </span>
            <span className="ai-thinking-dots text-primary font-bold">
              <span>.</span><span>.</span><span>.</span>
            </span>
          </div>
          <span className="text-micro text-muted-foreground tabular-nums">
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

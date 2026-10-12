import { Repeat } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WorkoutStepInput } from "@/lib/types";
import {
  STEP_KIND_LABELS,
  formatStepAmount,
  formatStepHr,
  formatStepPace,
  groupWorkoutSteps,
} from "@/lib/workout-guide";

const KIND_STYLES: Record<WorkoutStepInput["kind"], { dot: string; text: string }> = {
  warmup: { dot: "bg-sky-400", text: "text-sky-500 dark:text-sky-400" },
  work: { dot: "bg-primary", text: "text-primary" },
  recovery: { dot: "bg-emerald-400", text: "text-emerald-600 dark:text-emerald-400" },
  steady: { dot: "bg-amber-400", text: "text-amber-600 dark:text-amber-400" },
  cooldown: { dot: "bg-sky-400", text: "text-sky-500 dark:text-sky-400" },
};

function StepRow({ step, compact }: { step: WorkoutStepInput; compact?: boolean }) {
  const style = KIND_STYLES[step.kind];
  const amount = formatStepAmount(step);
  const pace = formatStepPace(step);
  const hr = formatStepHr(step);
  return (
    <li className="flex gap-3">
      <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", style.dot)} />
      <div className="min-w-0 flex-1">
        <p className={cn("font-semibold uppercase tracking-wide", compact ? "text-[9px]" : "text-[10px]", style.text)}>
          {STEP_KIND_LABELS[step.kind]}
        </p>
        <p className={cn("font-medium leading-snug", compact ? "text-xs" : "text-sm")}>
          {amount && <span className="tabular-nums">{amount}</span>}
          {amount && step.label && <span className="text-muted-foreground"> · </span>}
          {step.label}
        </p>
        {(pace || hr) && (
          <p className={cn("mt-0.5 tabular-nums text-muted-foreground", compact ? "text-[11px]" : "text-xs")}>
            {[pace && `Passo ${pace}`, hr && `♥ ${hr}`].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>
    </li>
  );
}

/** Sequenza guidata della seduta con i blocchi ripetuti raggruppati. */
export function WorkoutSteps({ steps, compact }: { steps: WorkoutStepInput[]; compact?: boolean }) {
  const blocks = groupWorkoutSteps(steps);
  if (!blocks.length) return null;
  return (
    <ol className={cn("flex flex-col", compact ? "gap-2" : "gap-3")}>
      {blocks.map((block, index) =>
        block.kind === "single" ? (
          <StepRow key={index} step={block.step} compact={compact} />
        ) : (
          <li key={index} className="rounded-xl border border-primary/25 bg-primary/[0.04] p-3">
            <p className={cn("mb-2 flex items-center gap-1.5 font-semibold text-primary", compact ? "text-xs" : "text-sm")}>
              <Repeat size={compact ? 12 : 14} />
              Ripeti {block.times} volte
            </p>
            <ol className={cn("flex flex-col", compact ? "gap-2" : "gap-2.5")}>
              {block.steps.map((step, stepIndex) => (
                <StepRow key={stepIndex} step={step} compact={compact} />
              ))}
            </ol>
          </li>
        ),
      )}
    </ol>
  );
}

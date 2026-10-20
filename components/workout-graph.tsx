import { cn } from "@/lib/utils";
import type { WorkoutStepInput, WorkoutType } from "@/lib/types";
import { estimateStep, stepIntensity } from "@/lib/workout-estimate";
import { stepVariant } from "@/lib/workout-guide";
import { TONES, type StepTone } from "@/lib/step-tones";

/** Colore per intensità, coerente con le zone cardiache (Z1 azzurro → Z5 rosso). */
export function intensityTone(step: WorkoutStepInput, type?: WorkoutType | null): StepTone {
  const variant = stepVariant(step);
  if (variant === "sprint") return TONES.sprint;
  if (variant === "walk") return TONES.walk;
  const level = stepIntensity(step, type);
  if (level >= 4) return TONES.hard;
  if (level >= 3) return TONES.tempo;
  if (level >= 2) return TONES.moderate;
  if (step.kind === "recovery") return TONES.jog;
  return TONES.easy;
}

const HEIGHT: Record<number, string> = {
  0.5: "16%",
  1: "28%",
  1.5: "40%",
  2: "55%",
  3: "75%",
  4: "100%",
};

/**
 * Profilo della seduta a blocchi: larghezza = durata stimata, altezza e
 * colore = intensità. Si legge a colpo d'occhio, senza legenda.
 */
export function WorkoutGraph({
  steps,
  type,
  size = "md",
  className,
}: {
  steps: WorkoutStepInput[];
  type?: WorkoutType | null;
  size?: "sm" | "md";
  className?: string;
}) {
  if (!steps.length) return null;
  const blocks = steps.map((step) => ({ step, seconds: Math.max(1, estimateStep(step).seconds) }));
  const total = blocks.reduce((sum, block) => sum + block.seconds, 0);
  return (
    <div
      className={cn("flex items-end gap-[2px]", size === "sm" ? "h-7" : "h-11", className)}
      role="img"
      aria-label="Profilo della seduta: blocchi più alti sono tratti più intensi"
    >
      {blocks.map(({ step, seconds }, index) => (
        <div
          key={index}
          className={cn("animate-grow-y min-w-[3px] rounded-t-[3px] rounded-b-[1px]", intensityTone(step, type).bar)}
          style={{
            flexGrow: seconds / total,
            flexBasis: 0,
            height: HEIGHT[stepIntensity(step, type)] ?? "50%",
            animationDelay: `${Math.min(index * 25, 400)}ms`,
          }}
        />
      ))}
    </div>
  );
}

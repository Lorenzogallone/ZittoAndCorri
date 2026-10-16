import { cn } from "@/lib/utils";
import type { WorkoutStepInput, WorkoutType } from "@/lib/types";
import { estimateStep, stepIntensity } from "@/lib/workout-estimate";

/** Colore per intensità, coerente con le zone cardiache (Z1 azzurro → Z5 rosso). */
export function intensityTone(step: WorkoutStepInput, type?: WorkoutType | null): { bar: string; dot: string; text: string } {
  const level = stepIntensity(step, type);
  if (level >= 4) return { bar: "bg-rose-500", dot: "bg-rose-500", text: "text-rose-600 dark:text-rose-400" };
  if (level >= 3) return { bar: "bg-amber-400", dot: "bg-amber-400", text: "text-amber-600 dark:text-amber-400" };
  if (level >= 2) return { bar: "bg-emerald-400", dot: "bg-emerald-400", text: "text-emerald-600 dark:text-emerald-400" };
  if (step.kind === "recovery") return { bar: "bg-sky-300 dark:bg-sky-500/60", dot: "bg-sky-300", text: "text-sky-600 dark:text-sky-400" };
  return { bar: "bg-sky-400", dot: "bg-sky-400", text: "text-sky-600 dark:text-sky-400" };
}

const HEIGHT: Record<number, string> = {
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
          className={cn("min-w-[3px] rounded-t-[3px] rounded-b-[1px]", intensityTone(step, type).bar)}
          style={{ flexGrow: seconds / total, flexBasis: 0, height: HEIGHT[stepIntensity(step, type)] ?? "50%" }}
        />
      ))}
    </div>
  );
}

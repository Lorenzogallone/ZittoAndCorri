import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { WorkoutStepInput, WorkoutType } from "@/lib/types";
import { estimateStep, stepIntensity } from "@/lib/workout-estimate";
import { stepVariant } from "@/lib/workout-guide";
import { TONES, type StepTone } from "@/lib/step-tones";

/** Colour by intensity, consistent with heart rate zones (Z1 light blue → Z5 red). */
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

// On the hero card (lighter than cards in dark mode) the muted dark-theme strokes
// (easy jog, walk) would disappear: fixed versions are used there.
const ON_DARK = new Map<StepTone, string>([
  [TONES.jog, "bg-sky-300"],
  [TONES.walk, "bg-hero-foreground/35"],
]);

const HEIGHT: Record<number, string> = {
  0.5: "16%",
  1: "28%",
  1.5: "40%",
  2: "55%",
  3: "75%",
  4: "100%",
};

/**
 * Profile of the block session: width = estimated duration, height and
 * colour = intensity. Readable at a glance, no legend.
 */
export function WorkoutGraph({
  steps,
  type,
  size = "md",
  onDark = false,
  className,
}: {
  steps: WorkoutStepInput[];
  type?: WorkoutType | null;
  size?: "sm" | "md";
  /** On a fixed dark background (hero card): colours readable in both themes. */
  onDark?: boolean;
  className?: string;
}) {
  const t = useTranslations("plan.graph");
  if (!steps.length) return null;
  const blocks = steps.map((step) => ({ step, seconds: Math.max(1, estimateStep(step).seconds) }));
  const total = blocks.reduce((sum, block) => sum + block.seconds, 0);
  return (
    <div
      className={cn("flex items-end gap-[2px]", size === "sm" ? "h-7" : "h-11", className)}
      role="img"
      aria-label={t("label")}
    >
      {blocks.map(({ step, seconds }, index) => {
        const tone = intensityTone(step, type);
        return (
          <div
            key={index}
            className={cn("animate-grow-y min-w-[3px] rounded-t-[3px] rounded-b-[1px]", (onDark && ON_DARK.get(tone)) || tone.bar)}
            style={{
              flexGrow: seconds / total,
              flexBasis: 0,
              height: HEIGHT[stepIntensity(step, type)] ?? "50%",
              animationDelay: `${Math.min(index * 25, 400)}ms`,
            }}
          />
        );
      })}
    </div>
  );
}

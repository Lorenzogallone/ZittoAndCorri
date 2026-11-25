import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { phaseLabel, type PhasePlan } from "@/lib/plan/phases";

/** Bar of the preparation phases with today's position. */
export function PhaseBar({ plan }: { plan: PhasePlan }) {
  const t = useTranslations("plan.phaseBar");
  const tl = useTranslations("labels");
  const totalWeeks = plan.phases.reduce((sum, phase) => sum + phase.weeks, 0);
  const currentIndex = plan.phases.findIndex((phase) => phase.key === plan.current);
  const current = plan.phases[currentIndex];
  const next = plan.phases[currentIndex + 1];
  return (
    <div>
      <div className="relative">
        <div className="flex gap-[2px]">
          {plan.phases.map((phase, index) => (
            <div
              key={phase.key}
              className={cn(
                "h-2 rounded-full",
                index < currentIndex ? "bg-primary/45" : index === currentIndex ? "bg-primary" : "bg-muted-foreground/20",
              )}
              style={{ flexGrow: phase.weeks / totalWeeks, flexBasis: 0 }}
            />
          ))}
        </div>
        <span
          className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-primary"
          style={{ left: `${plan.progress * 100}%` }}
          aria-hidden="true"
        />
      </div>
      {current && (
        <p className="mt-2 text-xs text-muted-foreground">
          {t.rich(next ? "currentThen" : "currentLast", {
            phase: phaseLabel(tl, current.key).toLowerCase(),
            next: next ? phaseLabel(tl, next.key).toLowerCase() : "",
            b: (chunks) => <span className="font-medium text-foreground">{chunks}</span>,
          })}
        </p>
      )}
    </div>
  );
}

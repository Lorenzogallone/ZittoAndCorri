import { cn } from "@/lib/utils";
import type { PhasePlan } from "@/lib/plan/phases";

/** Barra delle fasi di preparazione con la posizione di oggi. */
export function PhaseBar({ plan }: { plan: PhasePlan }) {
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
          Fase di <span className="font-medium text-foreground">{current.label.toLowerCase()}</span>
          {next ? ` · poi ${next.label.toLowerCase()}` : " · ultimi giorni prima della gara"}
        </p>
      )}
    </div>
  );
}

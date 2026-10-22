import Link from "next/link";
import { ChevronRight, Flag, ThermometerSun } from "lucide-react";
import { cn } from "@/lib/utils";
import { WorkoutGraph } from "@/components/workout-graph";
import { DayStateIcon } from "@/components/day-state-icon";
import { planRecovery } from "@/app/plan/actions";
import { TYPE_LABELS } from "@/lib/activity-meta";
import { workoutHeadline } from "@/lib/workout-guide";
import { workoutStepsOrLegacy } from "@/lib/workout-steps";
import { estimateWorkout } from "@/lib/workout-estimate";
import { plannedMeters } from "@/lib/plan/planned-distance";
import { relativeDayLabel } from "@/lib/local-date";
import type { DayView } from "@/lib/plan/day-status";
import type { HeatInfo } from "@/lib/weather";
import type { PlannedWorkout } from "@/lib/types";

const kmText = (meters: number) => `${(meters / 1000).toLocaleString("it-IT", { maximumFractionDigits: 1 })} km`;
const WEEKDAYS = ["L", "M", "M", "G", "V", "S", "D"];

type WeekDay = DayView<PlannedWorkout, { started_at: string; sport: string; distance_m: number }>;

interface Props {
  next: PlannedWorkout | null;
  today: string;
  heat: HeatInfo | null;
  week: WeekDay[];
  race: { name: string; date: string } | null;
}

function NextWorkout({ next, today, heat }: Pick<Props, "next" | "today" | "heat">) {
  if (!next) {
    return (
      <Link href="/?prompt=Mi+prepari+il+piano+delle+prossime+due+settimane%3F" className="flex items-center gap-3 px-4 py-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">Nessuna seduta in programma</p>
          <p className="mt-0.5 text-sm font-semibold">Chiedi un piano al coach</p>
        </div>
        <ChevronRight size={16} className="text-muted-foreground" />
      </Link>
    );
  }
  const steps = workoutStepsOrLegacy(next.workout_steps, next);
  const meters = plannedMeters({ ...next, workout_steps: steps });
  const seconds = next.target_duration_s ?? estimateWorkout(steps).seconds;
  const headline = workoutHeadline(steps) ?? (meters > 0 ? kmText(meters) : TYPE_LABELS[next.type]);
  return (
    <Link href={`/plan/${next.id}`} className="block px-4 pb-3 pt-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          <span className="capitalize">{relativeDayLabel(next.date, today)}</span> · {TYPE_LABELS[next.type]}
        </p>
        {heat && heat.pct > 0 && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400" title="Passi adattati al caldo">
            <ThermometerSun size={14} /> {heat.temp_c}°
          </span>
        )}
      </div>
      <p className="mt-0.5 text-xl font-bold tracking-tight">{headline}</p>
      {steps.length > 0 && <WorkoutGraph steps={steps} type={next.type} size="sm" className="mt-3" />}
      <p className="mt-2 text-xs text-muted-foreground tabular-nums">
        {[meters > 0 ? `≈ ${kmText(meters)}` : null, seconds ? `${Math.round(seconds / 60)} min` : null].filter(Boolean).join(" · ")}
      </p>
    </Link>
  );
}

/** Scheda principale della home: la prossima seduta e la settimana. */
export function TodayCard({ next, today, heat, week, race }: Props) {
  const planned = week.flatMap((day) => day.workouts).reduce((sum, workout) => sum + (workout.status === "skipped" ? 0 : plannedMeters(workout)), 0);
  const done = week.flatMap((day) => day.activities).filter((activity) => activity.sport === "running").reduce((sum, activity) => sum + activity.distance_m, 0);
  return (
    <div className="surface overflow-hidden">
      {race ? (
        race.date === today ? (
          <Link href={next ? `/plan/${next.id}` : "/plan"} className="flex items-center gap-3 px-4 py-4">
            <Flag size={20} className="shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">Oggi si corre</p>
              <p className="truncate text-base font-semibold">{race.name} · in bocca al lupo!</p>
            </div>
            <ChevronRight size={16} className="text-muted-foreground" />
          </Link>
        ) : (
          <form action={planRecovery} className="flex items-center gap-3 px-4 py-4">
            <Flag size={20} className="shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">Com&apos;è andata la {race.name}?</p>
              <p className="text-sm font-semibold">Ti preparo qualche giorno di recupero</p>
            </div>
            <button type="submit" className="shrink-0 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">Pianifica</button>
          </form>
        )
      ) : (
        <NextWorkout next={next} today={today} heat={heat} />
      )}

      <Link href="/plan" className="block border-t border-border/60 px-4 py-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Questa settimana</span>
          <span className="font-medium tabular-nums">
            {kmText(done)}{planned > 0 && <span className="text-muted-foreground"> / {kmText(planned)}</span>}
          </span>
        </div>
        <div className="mt-2.5 grid grid-cols-7 justify-items-center gap-1">
          {week.map((day, index) => (
            <div key={day.date} className="flex flex-col items-center gap-1">
              <span className={cn("text-micro", day.date === today ? "font-semibold text-primary" : "text-muted-foreground")}>{WEEKDAYS[index]}</span>
              <DayStateIcon state={day.state} size="sm" />
            </div>
          ))}
        </div>
      </Link>
    </div>
  );
}

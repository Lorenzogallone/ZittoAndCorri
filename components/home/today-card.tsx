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
import { sessionPlacement } from "@/lib/plan/day-sessions";
import type { DayView } from "@/lib/plan/day-status";
import type { HeatInfo } from "@/lib/weather";
import type { PlannedWorkout } from "@/lib/types";

const kmNumber = (meters: number) => (meters / 1000).toLocaleString("it-IT", { maximumFractionDigits: 1 });
const kmText = (meters: number) => `${kmNumber(meters)} km`;
const WEEKDAYS = ["L", "M", "M", "G", "V", "S", "D"];

// Titolo della card hero: è l'H1 visivo della home.
const HEADLINE = "font-display text-display font-bold tracking-tight text-balance tabular-nums";

type WeekDay = DayView<PlannedWorkout, { started_at: string; sport: string; distance_m: number }>;

interface Props {
  next: PlannedWorkout | null;
  /** Le altre sedute dello stesso giorno della prossima, in ordine; done = già corsa oggi. */
  sameDay: Array<{ workout: PlannedWorkout; done: boolean }>;
  /** Quante sedute ha quel giorno (per dire "mattina", "subito dopo"…). */
  sessionsThatDay: number;
  today: string;
  heat: HeatInfo | null;
  week: WeekDay[];
  race: { name: string; date: string } | null;
}

function NextWorkout({ next, today, heat, sessionsThatDay }: Pick<Props, "next" | "today" | "heat" | "sessionsThatDay">) {
  if (!next) {
    return (
      <div className="surface-hero p-5">
        <p className="eyebrow">Prossima seduta</p>
        <h1 className="mt-2 font-display text-title font-bold tracking-tight">Nessuna seduta in programma</h1>
        <Link
          href="/?prompt=Mi+prepari+il+piano+delle+prossime+due+settimane%3F"
          className="mt-4 inline-flex items-center gap-1 rounded-full bg-primary py-2 pl-4 pr-3 text-caption font-semibold text-primary-foreground transition-transform active:scale-95"
        >
          Chiedi un piano al coach <ChevronRight size={16} />
        </Link>
      </div>
    );
  }
  const steps = workoutStepsOrLegacy(next.workout_steps, next);
  const meters = plannedMeters({ ...next, workout_steps: steps });
  const seconds = next.target_duration_s ?? estimateWorkout(steps).seconds;
  const headline = workoutHeadline(steps) ?? (meters > 0 ? kmText(meters) : TYPE_LABELS[next.type]);
  const meta = [meters > 0 ? `≈ ${kmText(meters)}` : null, seconds ? `${Math.round(seconds / 60)} min` : null].filter(Boolean).join(" · ");
  return (
    <Link href={`/plan/${next.id}`} className="surface-hero block p-5 transition-transform active:scale-[0.99]">
      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow truncate">
          {[relativeDayLabel(next.date, today), sessionPlacement(next, sessionsThatDay), TYPE_LABELS[next.type]].filter(Boolean).join(" · ")}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {heat && heat.pct > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-hero-foreground/10 px-2 py-0.5 text-caption font-medium tabular-nums" title="Passi adattati al caldo">
              <ThermometerSun size={14} className="text-amber-600 dark:text-amber-300" /> {heat.temp_c}°
            </span>
          )}
          <ChevronRight size={18} className="text-hero-muted" />
        </div>
      </div>
      <h1 className={cn("mt-2", HEADLINE)}>{headline}</h1>
      {steps.length > 0 && <WorkoutGraph steps={steps} type={next.type} size="sm" onDark className="mt-4" />}
      {meta && <p className="mt-3 text-caption text-hero-muted tabular-nums">{meta}</p>}
    </Link>
  );
}

function RaceCard({ race, next, today }: { race: NonNullable<Props["race"]>; next: PlannedWorkout | null; today: string }) {
  const eyebrow = (text: string) => (
    <p className="eyebrow flex items-center gap-1.5">
      <Flag size={14} strokeWidth={2.4} className="shrink-0 text-primary" /> {text}
    </p>
  );
  if (race.date === today) {
    return (
      <Link href={next ? `/plan/${next.id}` : "/plan"} className="surface-hero block p-5 transition-transform active:scale-[0.99]">
        <div className="flex items-center justify-between gap-3">
          {eyebrow("Oggi si corre")}
          <ChevronRight size={18} className="shrink-0 text-hero-muted" />
        </div>
        <h1 className={cn("mt-2 line-clamp-2", HEADLINE)}>{race.name}</h1>
        <p className="mt-2 text-body text-hero-muted">In bocca al lupo!</p>
      </Link>
    );
  }
  return (
    <form action={planRecovery} className="surface-hero p-5">
      {eyebrow("Com'è andata?")}
      <h1 className={cn("mt-2 line-clamp-2", HEADLINE)}>{race.name}</h1>
      <p className="mt-2 text-body text-hero-muted">Ti preparo qualche giorno di recupero.</p>
      <button type="submit" className="mt-4 rounded-full bg-primary px-4 py-2 text-caption font-semibold text-primary-foreground transition-transform active:scale-95">
        Pianifica il recupero
      </button>
    </form>
  );
}

/** Le altre sedute dello stesso giorno, compatte sotto la card hero. */
function SameDaySessions({ sessions, sessionsThatDay }: { sessions: Props["sameDay"]; sessionsThatDay: number }) {
  if (!sessions.length) return null;
  return (
    <ul className="surface divide-y divide-border/60 px-4">
      {sessions.map(({ workout, done }) => {
        const steps = workoutStepsOrLegacy(workout.workout_steps, workout);
        const meters = plannedMeters({ ...workout, workout_steps: steps });
        const seconds = workout.target_duration_s ?? estimateWorkout(steps).seconds;
        const title = [TYPE_LABELS[workout.type], workoutHeadline(steps)].filter(Boolean).join(" · ");
        const meta = [
          done ? "Fatta" : sessionPlacement(workout, sessionsThatDay),
          meters > 0 ? `≈ ${kmText(meters)}` : null,
          seconds ? `${Math.round(seconds / 60)} min` : null,
        ].filter(Boolean).join(" · ");
        return (
          <li key={workout.id}>
            <Link href={`/plan/${workout.id}`} className="flex items-center gap-3 py-3 transition-transform active:scale-[0.99]">
              <DayStateIcon state={done ? "done" : "planned"} size="sm" />
              <div className="min-w-0 flex-1">
                <p className={cn("truncate text-body font-medium", done && "text-muted-foreground")}>{title}</p>
                {meta && <p className="mt-0.5 truncate text-caption text-muted-foreground tabular-nums">{meta}</p>}
              </div>
              <ChevronRight size={16} className="shrink-0 text-muted-foreground/60" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Home: la prossima seduta in evidenza (card hero), le altre dello stesso giorno e la settimana. */
export function TodayCard({ next, sameDay, sessionsThatDay, today, heat, week, race }: Props) {
  const planned = week.flatMap((day) => day.workouts).reduce((sum, workout) => sum + (workout.status === "skipped" ? 0 : plannedMeters(workout)), 0);
  const done = week.flatMap((day) => day.activities).filter((activity) => activity.sport === "running").reduce((sum, activity) => sum + activity.distance_m, 0);
  return (
    <div className="space-y-3">
      {race ? <RaceCard race={race} next={next} today={today} /> : <NextWorkout next={next} today={today} heat={heat} sessionsThatDay={sessionsThatDay} />}
      {!race && <SameDaySessions sessions={sameDay} sessionsThatDay={sessionsThatDay} />}

      <Link href="/plan" className="surface block px-4 py-3 transition-transform active:scale-[0.99]">
        <div className="flex items-baseline justify-between gap-3">
          <span className="eyebrow">Questa settimana</span>
          <span className="font-display text-heading font-bold tracking-tight tabular-nums">
            {kmNumber(done)}
            {planned > 0 && <span className="text-muted-foreground"> / {kmNumber(planned)}</span>}
            <span className="ml-1 font-sans text-caption font-medium tracking-normal text-muted-foreground">km</span>
          </span>
        </div>
        <div className="mt-2 grid grid-cols-7 justify-items-center gap-1">
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

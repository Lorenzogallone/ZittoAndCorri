import Link from "next/link";
import { ChevronRight, Flag } from "lucide-react";
import { cn } from "@/lib/utils";
import { PhaseBar } from "@/components/plan/phase-bar";
import { workoutSubtitle, workoutTitle } from "@/components/plan/week-list";
import { TYPE_DOTS } from "@/lib/activity-meta";
import { formatDistance, formatDuration } from "@/lib/format";
import { daysBetween } from "@/lib/local-date";
import type { PhasePlan } from "@/lib/plan/phases";
import type { Goal, PlannedWorkout } from "@/lib/types";

// Card della colonna laterale della home, solo desktop (la pagina le
// nasconde sotto lg): sul telefono la home resta seduta, settimana e chat.

function dayLabel(iso: string, today: string): string {
  const diff = daysBetween(today, iso);
  if (diff === 0) return "Oggi";
  if (diff === 1) return "Domani";
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("it-IT", { weekday: "short", day: "numeric", timeZone: "UTC" }).replace(".", "");
}

/** Le sedute dopo quella in evidenza, una riga ciascuna. */
export function UpcomingCard({ workouts, today }: { workouts: PlannedWorkout[]; today: string }) {
  if (!workouts.length) return null;
  return (
    <section className="surface px-4 pb-1 pt-3">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className="eyebrow">Poi in programma</h2>
        <Link href="/plan" className="flex items-center gap-0.5 text-caption font-medium text-primary">
          Piano <ChevronRight size={14} />
        </Link>
      </div>
      <ul className="divide-y divide-border/60">
        {workouts.map((workout) => (
          <li key={workout.id}>
            <Link href={`/plan/${workout.id}`} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/60">
              <span className="w-14 shrink-0 text-caption font-medium capitalize text-muted-foreground tabular-nums">{dayLabel(workout.date, today)}</span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-body font-medium">
                  <span className={cn("h-2 w-2 shrink-0 rounded-full", TYPE_DOTS[workout.type])} />
                  <span className="truncate">{workoutTitle(workout)}</span>
                </p>
                <p className="mt-0.5 truncate text-caption text-muted-foreground tabular-nums">{workoutSubtitle(workout)}</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Obiettivo attivo: gara, conto alla rovescia e fase della preparazione. */
export function GoalCard({
  goal,
  today,
  phases,
}: {
  goal: Pick<Goal, "race_name" | "race_date" | "distance_m" | "target_time_s"> | null;
  today: string;
  phases: PhasePlan | null;
}) {
  if (!goal) {
    return (
      <Link href="/?prompt=Vorrei+impostare+un+obiettivo" className="surface flex items-center gap-3 px-4 py-3 text-body text-muted-foreground transition-colors hover:bg-muted/40">
        <Flag size={18} strokeWidth={2.2} className="shrink-0 text-primary" />
        <span className="min-w-0 flex-1">Nessun obiettivo · parlane al coach</span>
        <ChevronRight size={16} className="shrink-0" />
      </Link>
    );
  }
  const days = goal.race_date ? daysBetween(today, goal.race_date) : null;
  const date = goal.race_date
    ? new Date(`${goal.race_date}T12:00:00Z`).toLocaleDateString("it-IT", { day: "numeric", month: "long", timeZone: "UTC" })
    : "senza data";
  return (
    <Link href="/goals" className="surface block px-4 py-4 transition-colors hover:bg-muted/40">
      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow flex items-center gap-1.5">
          <Flag size={14} strokeWidth={2.4} className="shrink-0 text-primary" /> Obiettivo
        </p>
        <ChevronRight size={16} className="shrink-0 text-muted-foreground/60" />
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate font-display text-title font-bold tracking-tight">{goal.race_name}</p>
        {days != null && days >= 0 && (
          <p className="shrink-0 font-display text-heading font-bold tabular-nums tracking-tight text-primary">
            {days === 0 ? "Oggi" : days === 1 ? "Domani" : `${days} gg`}
          </p>
        )}
      </div>
      <p className="mt-1 text-caption text-muted-foreground tabular-nums">
        {formatDistance(goal.distance_m)} · {date}
        {goal.target_time_s ? ` · in ${formatDuration(goal.target_time_s)}` : ""}
      </p>
      {phases && <div className="mt-4"><PhaseBar plan={phases} /></div>}
    </Link>
  );
}

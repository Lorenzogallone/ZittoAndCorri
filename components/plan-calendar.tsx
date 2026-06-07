"use client";

import Link from "next/link";
import type { PlannedWorkout, AdherenceResult, WorkoutType } from "@/lib/types";

const TYPE_COLORS: Record<string, string> = {
  easy: "bg-green-500/20 text-green-400",
  tempo: "bg-orange-500/20 text-orange-400",
  interval: "bg-red-500/20 text-red-400",
  long: "bg-violet-500/20 text-violet-400",
  race: "bg-yellow-500/20 text-yellow-400",
  recovery: "bg-blue-500/20 text-blue-400",
  cross: "bg-zinc-500/20 text-zinc-400",
};

const TYPE_SHORT: Record<string, string> = {
  easy: "Easy",
  tempo: "Tempo",
  interval: "Int.",
  long: "Lungo",
  race: "Gara",
  recovery: "Rec.",
  cross: "Cross",
};

const WEEKDAYS = ["L", "M", "M", "G", "V", "S", "D"];

function prevMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function nextMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  d.setMonth(d.getMonth() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("it-IT", {
    month: "long",
    year: "numeric",
  });
}

interface CompletedActivity {
  id: string;
  started_at: string;
  type: WorkoutType;
}

interface ActiveGoal {
  race_name: string;
  race_date: string | null;
  distance_m: number;
}

interface Props {
  workouts: PlannedWorkout[];
  activities: CompletedActivity[];
  goal: ActiveGoal | null;
  month: string;        // "YYYY-MM"
  today: string;        // "YYYY-MM-DD"
  adherence: AdherenceResult | null;
}

export function PlanCalendar({ workouts, activities, goal, month, today, adherence }: Props) {
  const [year, mon] = month.split("-").map(Number);
  const firstDay = new Date(year, mon - 1, 1);
  const lastDay = new Date(year, mon, 0);
  const daysInMonth = lastDay.getDate();

  const startWeekday = (firstDay.getDay() + 6) % 7;

  // Planned workouts by date (only non-completed)
  const byDate = new Map<string, PlannedWorkout[]>();
  for (const w of workouts) {
    if (w.status === "completed") continue;
    const arr = byDate.get(w.date) ?? [];
    arr.push(w);
    byDate.set(w.date, arr);
  }

  // Done activities by date
  const activitiesByDate = new Map<string, CompletedActivity[]>();
  for (const a of activities) {
    const date = a.started_at.slice(0, 10);
    const arr = activitiesByDate.get(date) ?? [];
    arr.push(a);
    activitiesByDate.set(date, arr);
  }

  // Race date (only if in this month)
  const raceDate = goal?.race_date && goal.race_date.startsWith(month) ? goal.race_date : null;

  const cells: Array<number | null> = [
    ...Array(startWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const hasAnything = workouts.length > 0 || activities.length > 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Header navigazione mese */}
      <div className="flex items-center justify-between">
        <Link
          href={`/plan?month=${prevMonth(month)}`}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-card border border-white/[0.06] text-muted-foreground hover:text-foreground transition-colors"
        >
          ←
        </Link>
        <h2 className="text-base font-semibold capitalize">{monthLabel(month)}</h2>
        <Link
          href={`/plan?month=${nextMonth(month)}`}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-card border border-white/[0.06] text-muted-foreground hover:text-foreground transition-colors"
        >
          →
        </Link>
      </div>

      {/* Giorni della settimana */}
      <div className="grid grid-cols-7 text-center">
        {WEEKDAYS.map((d, i) => (
          <span key={i} className="py-1 text-[10px] font-medium text-muted-foreground uppercase">
            {d}
          </span>
        ))}
      </div>

      {/* Griglia giorni */}
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((day, i) => {
          if (day === null) {
            return <div key={`e-${i}`} />;
          }

          const dateStr = `${month}-${String(day).padStart(2, "0")}`;
          const isToday = dateStr === today;
          const isRaceDay = dateStr === raceDate;
          const dayWorkouts = byDate.get(dateStr) ?? [];
          const dayActivities = activitiesByDate.get(dateStr) ?? [];

          return (
            <div
              key={dateStr}
              className={`min-h-[52px] rounded-lg p-1 flex flex-col gap-0.5 ${
                isRaceDay
                  ? "bg-primary/15 ring-1 ring-primary/40"
                  : isToday
                  ? "bg-primary/10 ring-1 ring-primary/30"
                  : ""
              }`}
            >
              <span
                className={`text-[11px] font-medium leading-none mb-0.5 ${
                  isRaceDay || isToday ? "text-primary" : "text-muted-foreground"
                }`}
              >
                {day}
              </span>

              {/* Badge gara */}
              {isRaceDay && (
                <span
                  className="block rounded px-1 py-0.5 text-[9px] font-medium leading-tight truncate bg-primary/20 text-primary"
                  title={goal?.race_name}
                >
                  🏁 {goal?.race_name}
                </span>
              )}

              {/* Corse fatte */}
              {dayActivities.map((a) => (
                <Link
                  key={a.id}
                  href={`/activities/${a.id}`}
                  className={`block rounded px-1 py-0.5 text-[9px] font-medium leading-tight truncate transition-opacity ${
                    TYPE_COLORS[a.type] ?? "bg-zinc-500/20 text-zinc-400"
                  }`}
                  title={`${TYPE_SHORT[a.type] ?? a.type} — completata`}
                >
                  ✓ {TYPE_SHORT[a.type] ?? a.type}
                </Link>
              ))}

              {/* Allenamenti pianificati (non completati) */}
              {dayWorkouts.map((w) => (
                <Link
                  key={w.id}
                  href={`/plan/${w.id}`}
                  className={`block rounded px-1 py-0.5 text-[9px] font-medium leading-tight truncate transition-opacity ${
                    TYPE_COLORS[w.type] ?? "bg-zinc-500/20 text-zinc-400"
                  } ${w.status === "missed" ? "opacity-40" : ""} ${
                    w.status === "skipped" ? "opacity-30 line-through" : ""
                  }`}
                  title={`${TYPE_SHORT[w.type] ?? w.type} — ${w.status}`}
                >
                  {TYPE_SHORT[w.type] ?? w.type}
                </Link>
              ))}
            </div>
          );
        })}
      </div>

      {/* Nota mese vuoto */}
      {!hasAnything && (
        <p className="text-center text-xs text-muted-foreground py-4">
          Il piano verrà generato dall&apos;AI (presto).
        </p>
      )}

      {/* Badge aderenza */}
      {adherence && adherence.total > 0 && (
        <div className="rounded-xl bg-card border border-white/[0.06] px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">
              Aderenza 14 gg
            </p>
            <p className="text-sm font-medium">
              {adherence.completed}/{adherence.total} completati
              {adherence.skipped > 0 && ` · ${adherence.skipped} scartati`}
            </p>
          </div>
          <span
            className={`text-2xl font-bold tabular-nums ${
              adherence.pct >= 75
                ? "text-green-400"
                : adherence.pct >= 50
                ? "text-yellow-400"
                : "text-red-400"
            }`}
          >
            {adherence.pct}%
          </span>
        </div>
      )}
    </div>
  );
}

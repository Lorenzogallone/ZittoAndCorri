"use client";

import Link from "next/link";
import type { ActivityType, PlannedWorkout, Sport } from "@/lib/types";
import { TYPE_COLORS, SPORT_COLORS, SPORT_LABELS } from "@/lib/activity-meta";

const TYPE_SHORT: Record<string, string> = {
  unclassified: "Corsa",
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
  type: ActivityType;
  sport?: Sport;
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
}

export function PlanCalendar({ workouts, activities, goal, month, today }: Props) {
  const [year, mon] = month.split("-").map(Number);
  const firstDay = new Date(year, mon - 1, 1);
  const lastDay = new Date(year, mon, 0);
  const daysInMonth = lastDay.getDate();

  const startWeekday = (firstDay.getDay() + 6) % 7;

  // Planned workouts by date (inclusi i completati: vanno mostrati accanto
  // alla corsa reale, non nascosti).
  const byDate = new Map<string, PlannedWorkout[]>();
  for (const w of workouts) {
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

          // L'intera cella è il target di tap: porta alla vista giorno, dove
          // pianificato e corse reali sono mostrati in parallelo.
          return (
            <Link
              key={dateStr}
              href={`/plan/day/${dateStr}`}
              className={`min-h-[52px] rounded-lg p-1 flex flex-col gap-0.5 transition-colors active:scale-[0.97] ${
                isRaceDay
                  ? "bg-primary/15 ring-1 ring-primary/40"
                  : isToday
                  ? "bg-primary/10 ring-1 ring-primary/30"
                  : "hover:bg-muted/40"
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

              {/* Attività fatte (indicatori visivi): corse col tipo, altri
                  sport con la propria label/colore */}
              {dayActivities.map((a) => {
                const isRun = (a.sport ?? "running") === "running";
                return (
                  <span
                    key={a.id}
                    className={`block rounded px-1 py-0.5 text-[9px] font-medium leading-tight truncate ${
                      (isRun
                        ? TYPE_COLORS[a.type]
                        : SPORT_COLORS[a.sport ?? "other"]) ??
                      "bg-zinc-500/20 text-zinc-400"
                    }`}
                  >
                    ✓ {isRun ? TYPE_SHORT[a.type] ?? a.type : SPORT_LABELS[a.sport ?? "other"]}
                  </span>
                );
              })}

              {/* Allenamenti pianificati (indicatori visivi) */}
              {dayWorkouts.map((w) => (
                <span
                  key={w.id}
                  className={`block rounded px-1 py-0.5 text-[9px] font-medium leading-tight truncate ${
                    TYPE_COLORS[w.type] ?? "bg-zinc-500/20 text-zinc-400"
                  }`}
                >
                  {TYPE_SHORT[w.type] ?? w.type}
                </span>
              ))}
            </Link>
          );
        })}
      </div>

      {/* Nota mese vuoto */}
      {!hasAnything && (
        <p className="text-center text-xs text-muted-foreground py-4">
          Il piano verrà generato dall&apos;AI (presto).
        </p>
      )}

    </div>
  );
}

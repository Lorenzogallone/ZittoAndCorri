import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { TYPE_DOTS } from "@/lib/activity-meta";
import type { PlanDay } from "@/components/plan/week-list";

const WEEKDAYS = ["L", "M", "M", "G", "V", "S", "D"];

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("it-IT", { month: "long", year: "numeric", timeZone: "UTC" });
}

interface Props {
  days: PlanDay[];
  month: string;
  today: string;
  raceDate: string | null;
}

/** Vista mese: un pallino per seduta, pieno se fatta, vuoto se saltata. */
export function PlanCalendar({ days, month, today, raceDate }: Props) {
  const startWeekday = (new Date(`${month}-01T12:00:00Z`).getUTCDay() + 6) % 7;
  const cells: Array<PlanDay | null> = [...Array(startWeekday).fill(null), ...days];

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <Link href={`/plan?view=month&month=${shiftMonth(month, -1)}`} className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted" aria-label="Mese precedente">
          <ChevronLeft size={18} />
        </Link>
        <h2 className="text-sm font-semibold capitalize">{monthLabel(month)}</h2>
        <Link href={`/plan?view=month&month=${shiftMonth(month, 1)}`} className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted" aria-label="Mese successivo">
          <ChevronRight size={18} />
        </Link>
      </div>

      <div className="grid grid-cols-7 text-center">
        {WEEKDAYS.map((d, i) => (
          <span key={i} className="py-1 text-[10px] font-medium uppercase text-muted-foreground">{d}</span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, index) => {
          if (!day) return <div key={`e-${index}`} />;
          const isToday = day.date === today;
          const isRace = day.date === raceDate;
          const filled = day.state === "done";
          const workouts = day.workouts.filter((workout) => workout.status !== "skipped");
          return (
            <Link
              key={day.date}
              href={day.workouts.length === 1 ? `/plan/${day.workouts[0].id}` : `/plan/day/${day.date}`}
              className={cn(
                "flex aspect-square flex-col items-center justify-center gap-1 rounded-xl transition-colors active:scale-[0.97]",
                isToday ? "bg-primary/10 ring-1 ring-primary/40" : isRace ? "bg-primary/10" : "hover:bg-muted/50",
              )}
              aria-label={day.date}
            >
              <span className={cn("text-xs tabular-nums", isToday || isRace ? "font-semibold text-primary" : "text-foreground/80")}>
                {isRace ? "🏁" : Number(day.date.slice(8))}
              </span>
              <span className="flex h-1.5 items-center gap-0.5">
                {workouts.slice(0, 3).map((workout) => (
                  <span
                    key={workout.id}
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      filled ? TYPE_DOTS[workout.type] : day.state === "missed" ? "border border-muted-foreground/50" : cn(TYPE_DOTS[workout.type], "opacity-40"),
                    )}
                  />
                ))}
                {!workouts.length && day.activities.length > 0 && <span className="h-1.5 w-1.5 rounded-full bg-primary/40" />}
              </span>
            </Link>
          );
        })}
      </div>

      <div className="mt-3 flex justify-center gap-4 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Fatta</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500 opacity-40" />In programma</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full border border-muted-foreground/50" />Saltata</span>
      </div>
    </div>
  );
}

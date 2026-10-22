import Link from "next/link";
import { activeDuration, formatDistance, formatDuration, formatPace } from "@/lib/format";
import { romeDay } from "@/lib/local-date";
import { cn } from "@/lib/utils";
import { SPORT_COLORS, SPORT_ICONS, SPORT_LABELS, TYPE_COLORS, TYPE_LABELS } from "@/lib/activity-meta";
import type { Activity } from "@/lib/types";

export type ListActivity = Pick<
  Activity,
  "id" | "started_at" | "type" | "sport" | "distance_m" | "duration_s" | "moving_time_s" | "avg_pace_s_km" | "elevation_gain_m" | "source_title"
>;

function monthLabel(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("it-IT", { month: "long", year: "numeric", timeZone: "UTC" });
}

function dayLabel(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("it-IT", { weekday: "short", day: "numeric", timeZone: "UTC" }).replace(".", "");
}

/** "12,34": come formatDistance, senza unità (resa a parte, più piccola). */
const kmValue = (meters: number) => formatDistance(meters).replace(" km", "");

function ActivityRow({ activity, analyzing }: { activity: ListActivity; analyzing: boolean }) {
  const isRun = activity.sport === "running";
  const Icon = SPORT_ICONS[activity.sport ?? "other"];
  const day = romeDay(activity.started_at);
  const title = activity.source_title || (isRun ? TYPE_LABELS[activity.type] : SPORT_LABELS[activity.sport]);
  return (
    <li>
      <Link href={`/activities/${activity.id}`} className="flex items-center gap-3 py-3 transition-colors active:bg-muted/40">
        {/* Tessera nel colore del tipo di seduta (corse) o dello sport. */}
        <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", isRun ? TYPE_COLORS[activity.type] : SPORT_COLORS[activity.sport ?? "other"])}>
          <Icon size={18} strokeWidth={2.2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-body font-semibold">{title}</p>
          <p className="mt-0.5 truncate text-caption text-muted-foreground tabular-nums">
            {dayLabel(day)} · {formatDuration(activeDuration(activity))}
            {analyzing && <span className="text-primary"> · analisi in corso…</span>}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-display text-heading font-bold tabular-nums tracking-tight">
            {activity.distance_m > 0 ? (
              <>
                {kmValue(activity.distance_m)}
                <span className="ml-0.5 font-sans text-caption font-medium tracking-normal text-muted-foreground">km</span>
              </>
            ) : (
              formatDuration(activeDuration(activity))
            )}
          </p>
          {isRun && activity.avg_pace_s_km != null && (
            <p className="text-caption text-muted-foreground tabular-nums">{formatPace(activity.avg_pace_s_km)}</p>
          )}
        </div>
      </Link>
    </li>
  );
}

/** Corse raggruppate per mese, una riga compatta ciascuna. */
export function ActivitiesList({ activities, analyzing }: { activities: ListActivity[]; analyzing: Set<string> }) {
  const months: Array<{ key: string; items: ListActivity[] }> = [];
  for (const activity of activities) {
    const key = romeDay(activity.started_at).slice(0, 7);
    const group = months.at(-1);
    if (group?.key === key) group.items.push(activity);
    else months.push({ key, items: [activity] });
  }
  return (
    <>
      {months.map((month) => (
        <section key={month.key} className="mt-8">
          <h2 className="eyebrow mb-2 px-1">{monthLabel(`${month.key}-01`)}</h2>
          <ul className="surface divide-y divide-border/60 px-4">
            {month.items.map((activity) => (
              <ActivityRow key={activity.id} activity={activity} analyzing={analyzing.has(activity.id)} />
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

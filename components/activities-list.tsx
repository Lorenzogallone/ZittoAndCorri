import Link from "next/link";
import { activeDuration, formatDistance, formatDuration, formatPace } from "@/lib/format";
import { romeDay } from "@/lib/local-date";
import { cn } from "@/lib/utils";
import { SPORT_ICONS, SPORT_LABELS, TYPE_DOTS, TYPE_LABELS } from "@/lib/activity-meta";
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

function ActivityRow({ activity, analyzing }: { activity: ListActivity; analyzing: boolean }) {
  const isRun = activity.sport === "running";
  const Icon = SPORT_ICONS[activity.sport ?? "other"];
  const day = romeDay(activity.started_at);
  const title = activity.source_title || (isRun ? TYPE_LABELS[activity.type] : SPORT_LABELS[activity.sport]);
  return (
    <li>
      <Link href={`/activities/${activity.id}`} className="flex items-center gap-3 py-3 transition-colors active:bg-muted/40">
        <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <Icon size={18} />
          {isRun && <span className={cn("absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-card", TYPE_DOTS[activity.type])} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-body font-medium">{title}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground tabular-nums">
            {dayLabel(day)} · {formatDuration(activeDuration(activity))}
            {analyzing && <span className="text-primary"> · analisi in corso…</span>}
          </p>
        </div>
        <div className="shrink-0 text-right tabular-nums">
          <p className="text-body font-semibold">
            {activity.distance_m > 0 ? formatDistance(activity.distance_m) : formatDuration(activeDuration(activity))}
          </p>
          {isRun && activity.avg_pace_s_km != null && (
            <p className="mt-0.5 text-xs text-muted-foreground">{formatPace(activity.avg_pace_s_km)}</p>
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
        <section key={month.key} className="mb-6">
          <h2 className="mb-1 px-1 text-caption font-medium capitalize text-muted-foreground">{monthLabel(`${month.key}-01`)}</h2>
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

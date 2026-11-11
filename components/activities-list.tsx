import Link from "next/link";
import { activeDuration, formatDistance, formatDuration, formatPace } from "@/lib/format";
import { romeDay } from "@/lib/local-date";
import { cn } from "@/lib/utils";
import { SPORT_COLORS, SPORT_ICONS, SPORT_LABELS, TYPE_COLORS, TYPE_LABELS } from "@/lib/activity-meta";
import type { Activity } from "@/lib/types";

export type ListActivity = Pick<
  Activity,
  "id" | "started_at" | "type" | "sport" | "distance_m" | "duration_s" | "moving_time_s" | "avg_pace_s_km" | "elevation_gain_m" | "source_title"
> & { excluded_at?: string | null };

function monthLabel(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("it-IT", { month: "long", year: "numeric", timeZone: "UTC" });
}

function dayLabel(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("it-IT", { weekday: "short", day: "numeric", timeZone: "UTC" }).replace(".", "");
}

// Desktop largo: la riga diventa una tabella (tempo e passo da xl, dislivello
// da 2xl) con le intestazioni sopra ogni mese. Sul telefono resta compatta.
const COLUMN = "hidden shrink-0 text-right tabular-nums xl:block xl:w-20 3xl:w-28";
const ELEVATION_COLUMN = "hidden shrink-0 text-right tabular-nums 2xl:block 2xl:w-20 3xl:w-28";
const DISTANCE_COLUMN = "shrink-0 text-right xl:w-24 3xl:w-28";

/** "12,34": come formatDistance, senza unità (resa a parte, più piccola). */
const kmValue = (meters: number) => formatDistance(meters).replace(" km", "");

function ActivityRow({ activity, analyzing }: { activity: ListActivity; analyzing: boolean }) {
  const isRun = activity.sport === "running";
  const Icon = SPORT_ICONS[activity.sport ?? "other"];
  const day = romeDay(activity.started_at);
  const title = activity.source_title || (isRun ? TYPE_LABELS[activity.type] : SPORT_LABELS[activity.sport]);
  return (
    <li>
      <Link href={`/activities/${activity.id}`} className={cn("-mx-2 flex items-center gap-3 rounded-lg px-2 py-3 transition-colors active:bg-muted/60", activity.excluded_at && "opacity-55")}>
        {/* Tessera nel colore del tipo di seduta (corse) o dello sport. */}
        <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", isRun ? TYPE_COLORS[activity.type] : SPORT_COLORS[activity.sport ?? "other"])}>
          <Icon size={18} strokeWidth={2.2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-body font-semibold">{title}</p>
          <p className="mt-0.5 truncate text-caption text-muted-foreground tabular-nums">
            {dayLabel(day)}<span className="xl:hidden"> · {formatDuration(activeDuration(activity))}</span>
            {activity.excluded_at && <span> · esclusa</span>}
            {analyzing && <span className="text-primary"> · analisi in corso…</span>}
          </p>
        </div>
        <p className={cn(COLUMN, "text-body")}>{formatDuration(activeDuration(activity))}</p>
        <p className={cn(ELEVATION_COLUMN, "text-body text-muted-foreground")}>
          {activity.elevation_gain_m ? `${Math.round(activity.elevation_gain_m).toLocaleString("it-IT")} m` : "–"}
        </p>
        <p className={cn(COLUMN, "text-body text-muted-foreground")}>
          {isRun && activity.avg_pace_s_km != null ? formatPace(activity.avg_pace_s_km) : "–"}
        </p>
        <div className={DISTANCE_COLUMN}>
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
            <p className="text-caption text-muted-foreground tabular-nums xl:hidden">{formatPace(activity.avg_pace_s_km)}</p>
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
          <div className="mb-2 flex items-baseline gap-3 px-1 xl:pr-4">
            <h2 className="eyebrow min-w-0 flex-1">{monthLabel(`${month.key}-01`)}</h2>
            <span className={cn(COLUMN, "eyebrow")} aria-hidden="true">Tempo</span>
            <span className={cn(ELEVATION_COLUMN, "eyebrow")} aria-hidden="true">Dislivello</span>
            <span className={cn(COLUMN, "eyebrow")} aria-hidden="true">Passo</span>
            <span className={cn(DISTANCE_COLUMN, "eyebrow hidden xl:block")} aria-hidden="true">Distanza</span>
          </div>
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

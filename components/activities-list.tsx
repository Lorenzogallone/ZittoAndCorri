import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { intlLocale, type Locale } from "@/i18n/config";
import { activeDuration, formatDistance, formatDuration, formatPace } from "@/lib/format";
import { romeDay } from "@/lib/local-date";
import { cn } from "@/lib/utils";
import { SPORT_COLORS, SPORT_ICONS, sportLabel, TYPE_COLORS, typeLabel } from "@/lib/activity-meta";
import type { Activity } from "@/lib/types";

export type ListActivity = Pick<
  Activity,
  "id" | "started_at" | "type" | "sport" | "distance_m" | "duration_s" | "moving_time_s" | "avg_pace_s_km" | "elevation_gain_m" | "source_title"
> & { excluded_at?: string | null };

function monthLabel(day: string, locale: Locale): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString(intlLocale(locale), { month: "long", year: "numeric", timeZone: "UTC" });
}

function dayLabel(day: string, locale: Locale): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString(intlLocale(locale), { weekday: "short", day: "numeric", timeZone: "UTC" }).replace(".", "");
}

// Wide desktop: the row becomes a table (time and pace from xl, elevation
// gain from 2xl) with headers above each month. On phones it stays compact.
const COLUMN = "hidden shrink-0 text-right tabular-nums xl:block xl:w-20 3xl:w-28";
const ELEVATION_COLUMN = "hidden shrink-0 text-right tabular-nums 2xl:block 2xl:w-20 3xl:w-28";
const DISTANCE_COLUMN = "shrink-0 text-right xl:w-24 3xl:w-28";

/** "12,34": like formatDistance, without the unit (rendered separately, smaller). */
const kmValue = (meters: number, locale: Locale) => formatDistance(meters, locale).replace(" km", "");

function ActivityRow({ activity, analyzing }: { activity: ListActivity; analyzing: boolean }) {
  const t = useTranslations("activities.list");
  const locale = useLocale() as Locale;
  const tl = useTranslations("labels");
  const isRun = activity.sport === "running";
  const Icon = SPORT_ICONS[activity.sport ?? "other"];
  const day = romeDay(activity.started_at);
  const title = activity.source_title || (isRun ? typeLabel(tl, activity.type) : sportLabel(tl, activity.sport));
  return (
    <li>
      <Link href={`/activities/${activity.id}`} className={cn("-mx-2 flex items-center gap-3 rounded-lg px-2 py-3 transition-colors active:bg-muted/60", activity.excluded_at && "opacity-55")}>
        {/* Tile in the session type colour (runs) or the sport colour. */}
        <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", isRun ? TYPE_COLORS[activity.type] : SPORT_COLORS[activity.sport ?? "other"])}>
          <Icon size={18} strokeWidth={2.2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-body font-semibold">{title}</p>
          <p className="mt-0.5 truncate text-caption text-muted-foreground tabular-nums">
            {dayLabel(day, locale)}<span className="xl:hidden"> · {formatDuration(activeDuration(activity))}</span>
            {activity.excluded_at && <span> · {t("excluded")}</span>}
            {analyzing && <span className="text-primary"> · {t("analyzing")}</span>}
          </p>
        </div>
        <p className={cn(COLUMN, "text-body")}>{formatDuration(activeDuration(activity))}</p>
        <p className={cn(ELEVATION_COLUMN, "text-body text-muted-foreground")}>
          {activity.elevation_gain_m ? `${Math.round(activity.elevation_gain_m).toLocaleString(intlLocale(locale))} m` : "–"}
        </p>
        <p className={cn(COLUMN, "text-body text-muted-foreground")}>
          {isRun && activity.avg_pace_s_km != null ? formatPace(activity.avg_pace_s_km) : "–"}
        </p>
        <div className={DISTANCE_COLUMN}>
          <p className="font-display text-heading font-bold tabular-nums tracking-tight">
            {activity.distance_m > 0 ? (
              <>
                {kmValue(activity.distance_m, locale)}
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

/** Runs grouped by month, one compact row each. */
export function ActivitiesList({ activities, analyzing }: { activities: ListActivity[]; analyzing: Set<string> }) {
  const t = useTranslations("activities.list");
  const locale = useLocale() as Locale;
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
            <h2 className="eyebrow min-w-0 flex-1">{monthLabel(`${month.key}-01`, locale)}</h2>
            <span className={cn(COLUMN, "eyebrow")} aria-hidden="true">{t("time")}</span>
            <span className={cn(ELEVATION_COLUMN, "eyebrow")} aria-hidden="true">{t("elevation")}</span>
            <span className={cn(COLUMN, "eyebrow")} aria-hidden="true">{t("pace")}</span>
            <span className={cn(DISTANCE_COLUMN, "eyebrow hidden xl:block")} aria-hidden="true">{t("distance")}</span>
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

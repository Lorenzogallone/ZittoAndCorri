import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { intlLocale, type Locale } from "@/i18n/config";
import { Activity, ChevronRight, HeartPulse, Moon, Wind, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Stat } from "@/components/stat";
import { TrendBadge } from "@/components/progress/trend-badge";
import type { MetricTrend } from "@/lib/metrics/body-trends";
import type { ATLCTLResult } from "@/lib/types";
import type { WellnessDay, ZeppDailyMetric, ZeppReadinessResult } from "@/lib/zepp/types";

/** The colour of each load state; label and text are in `profile.loadStates.<state>`. */
export const LOAD_TONES = {
  calibrating: "text-foreground",
  fresh: "text-emerald-600 dark:text-emerald-400",
  balanced: "text-emerald-600 dark:text-emerald-400",
  strained: "text-amber-600 dark:text-amber-400",
  fatigued: "text-orange-600 dark:text-orange-400",
} satisfies Record<ATLCTLResult["status"], string>;

/** Colour of each readiness state; texts in `profile.formStatus.readinessStates.<state>`. */
const ZEPP_TONES = {
  intense: "text-emerald-600 dark:text-emerald-400",
  ready: "text-emerald-600 dark:text-emerald-400",
  moderate: "text-amber-600 dark:text-amber-400",
  recovery: "text-orange-600 dark:text-orange-400",
  rest: "text-orange-600 dark:text-orange-400",
} as const;

/** Readiness ring: the arc takes the state colour (green, amber,
 *  orange) like the label beside it, not the accent. */
function ScoreRing({ value, tone }: { value: number; tone: string }) {
  const t = useTranslations("profile.formStatus");
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="relative h-28 w-28 shrink-0" role="img" aria-label={t("readinessAria", { value: clamped })}>
      <svg viewBox="0 0 112 112" className={cn("h-28 w-28 -rotate-90", tone)}>
        <circle cx="56" cy="56" r="51" fill="none" strokeWidth="10" className="stroke-muted" />
        <circle
          cx="56"
          cy="56"
          r="51"
          fill="none"
          stroke="currentColor"
          strokeWidth="10"
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={100}
          strokeDashoffset={100 - clamped}
          className="animate-ring"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-display text-display font-bold tabular-nums tracking-tight">{clamped}</span>
    </div>
  );
}

/** "today at 07:42", "yesterday at 22:10", "3 Nov at 08:00" (Rome time). */
function syncLabel(iso: string, t: ReturnType<typeof useTranslations>, locale: Locale, now = new Date()): string {
  const day = (date: Date) => date.toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });
  const date = new Date(iso);
  const time = date.toLocaleTimeString(intlLocale(locale), { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });
  const yesterday = new Date(now.getTime() - 86_400_000);
  if (day(date) === day(now)) return t("syncToday", { time });
  if (day(date) === day(yesterday)) return t("syncYesterday", { time });
  const dayLabel = date.toLocaleDateString(intlLocale(locale), { day: "numeric", month: "short", timeZone: "Europe/Rome" });
  return t("syncOther", { date: dayLabel, time });
}

function sleepLabel(minutes: number): string {
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}′`;
}

/** Featured metric under the state: value, and below the trend direction or a note. */
export interface FormHighlight {
  label: string;
  value: string;
  unit?: string;
  icon: LucideIcon;
  trend?: Pick<MetricTrend, "direction" | "recent" | "previous">;
  note?: string;
}

/** Profile hero: form state, watch readiness and the few data that matter.
 *  With `href` the whole card opens the analysis view. */
export function FormStatus({
  load,
  readiness,
  latest,
  wellness = null,
  stale,
  lastSync = null,
  hasData,
  highlights,
  href,
}: {
  load: ATLCTLResult;
  readiness: ZeppReadinessResult | null;
  latest: ZeppDailyMetric | null;
  /** Most recent day from Intervals.icu: fills the data Zepp does not have. */
  wellness?: WellnessDay | null;
  stale: boolean;
  /** Latest data point from the watch (Zepp or Intervals.icu). */
  lastSync?: string | null;
  hasData: boolean;
  /** Featured metrics (VO₂max, load, sleep); without them, the day's ones. */
  highlights?: FormHighlight[];
  href?: string;
}) {
  const t = useTranslations("profile.formStatus");
  const locale = useLocale() as Locale;
  const tLoad = useTranslations("profile.loadStates");
  const assistedStatus = readiness?.available && readiness.status ? readiness.status : null;
  const state = assistedStatus
    ? {
        label: t(`readinessStates.${assistedStatus}.label`),
        text: t(`readinessStates.${assistedStatus}.text`),
        tone: ZEPP_TONES[assistedStatus],
      }
    : { label: tLoad(`${load.status}.label`), text: tLoad(`${load.status}.text`), tone: LOAD_TONES[load.status] };
  // Zepp when available, otherwise the overnight data from Intervals.icu.
  const sleepMin = latest?.sleep_total_min ?? (wellness?.sleep_secs != null ? Math.round(wellness.sleep_secs / 60) : null);
  const restingHr = latest?.resting_hr ?? wellness?.resting_hr ?? null;
  const metrics = [
    sleepMin != null ? { label: t("metrics.sleep"), value: sleepLabel(sleepMin), icon: Moon } : null,
    restingHr != null ? { label: t("metrics.restingHr"), value: `${restingHr}`, unit: "bpm", icon: HeartPulse } : null,
    // Intervals.icu stores 0 when the night has no HRV: it is not a measurement.
    wellness?.hrv != null && wellness.hrv > 0 ? { label: t("metrics.hrv"), value: `${Math.round(wellness.hrv)}`, unit: "ms", icon: Activity } : null,
    latest?.vo2_max != null ? { label: t("metrics.vo2max"), value: `${latest.vo2_max}`, icon: Wind } : null,
  ].filter((metric) => metric != null).slice(0, 3);
  const shown: FormHighlight[] = highlights?.length ? highlights.slice(0, 3) : metrics;

  if (!hasData) {
    return (
      <section className="surface p-5">
        <p className="eyebrow">{t("title")}</p>
        <p className="mt-2 text-body text-muted-foreground">{t("empty.text")}</p>
        <Link
          href="/activities/new"
          className="mt-4 inline-flex items-center gap-1 rounded-full bg-primary py-2 pl-4 pr-3 text-caption font-semibold text-primary-foreground transition-transform active:scale-95"
        >
          {t("empty.import")} <ChevronRight size={16} />
        </Link>
      </section>
    );
  }

  const ring = readiness?.available && readiness.score != null ? readiness.score : null;
  const Wrapper = href ? Link : "section";
  return (
    <Wrapper href={href!} className={cn("surface block p-5", href && "pressable outline-none focus-visible:ring-3 focus-visible:ring-ring/30")}>
      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow">{t("title")}</p>
        {href && (
          <span className="-my-1 inline-flex items-center gap-0.5 text-caption font-medium text-primary">
            {t("trendLink")} <ChevronRight size={16} className="-mr-1" aria-hidden="true" />
          </span>
        )}
      </div>
      {ring != null ? (
        <div className="mt-4 flex items-center gap-5">
          <ScoreRing value={ring} tone={state.tone} />
          <div className="min-w-0">
            <p className={cn("font-display text-title font-bold tracking-tight text-balance", state.tone)}>{state.label}</p>
            <p className="mt-1.5 text-caption text-muted-foreground">{state.text}</p>
          </div>
        </div>
      ) : (
        // Without a watch the state label is the dominant element.
        <div className="mt-2">
          <p className={cn("font-display text-display font-bold tracking-tight text-balance", state.tone)}>{state.label}</p>
          <p className="mt-2 text-body text-muted-foreground">{state.text}</p>
        </div>
      )}
      {shown.length > 0 && (
        <div className="mt-5 grid grid-cols-3 gap-3 border-t border-border/60 pt-4">
          {shown.map(({ trend, note, ...metric }) => (
            <div key={metric.label} className="min-w-0">
              <Stat size="sm" {...metric} />
              {trend?.direction ? (
                <TrendBadge trend={trend} className="mt-0.5" />
              ) : note ? (
                <p className="mt-0.5 truncate text-micro text-muted-foreground">{note}</p>
              ) : null}
            </div>
          ))}
        </div>
      )}
      {stale && (
        <p className="mt-4 text-caption text-muted-foreground">
          {t("stale")}
        </p>
      )}
      {lastSync && (
        <p className={cn("text-micro text-muted-foreground", stale ? "mt-1" : "mt-3")}>
          {t("lastSync", { when: syncLabel(lastSync, t, locale) })}
        </p>
      )}
    </Wrapper>
  );
}

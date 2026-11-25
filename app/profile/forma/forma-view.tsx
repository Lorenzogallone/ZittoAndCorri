import { ChevronDown } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { intlLocale, type Locale } from "@/i18n/config";
import { AppShell } from "@/components/app-shell";
import { Section } from "@/components/section";
import { Stat } from "@/components/stat";
import { FormChart, type FormPoint } from "@/components/charts/form-chart";
import { TrendChart } from "@/components/charts/trend-chart";
import { TrendBadge } from "@/components/progress/trend-badge";
import { LOAD_TONES } from "@/components/progress/form-status";
import { daysBetween } from "@/lib/local-date";
import { cn } from "@/lib/utils";
import { BODY_METRICS, formatMetric, type BodyMetricKey, type MetricTrend } from "@/lib/metrics/body-trends";
import type { ATLCTLResult } from "@/lib/types";

/** `id` is the key of the title in `profile.forma.groups`. */
const GROUPS: Array<{ id: string; keys: BodyMetricKey[] }> = [
  { id: "aerobic", keys: ["vo2max", "efficiency"] },
  { id: "recovery", keys: ["restingHr", "hrv", "stress", "spo2"] },
  { id: "sleep", keys: ["sleep", "sleepDeep", "sleepScore"] },
  { id: "dailyLoad", keys: ["watchLoad", "pai", "steps", "weight"] },
];

/** The metrics that matter for the sentence at the top, in order of weight; the names
 * are in `profile.forma.summary.labels`. */
const SUMMARY_KEYS = ["vo2max", "efficiency", "fitness", "restingHr", "hrv", "sleep", "sleepDeep", "stress"] as const satisfies readonly BodyMetricKey[];

function shortDate(iso: string, locale: Locale): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(intlLocale(locale), { day: "numeric", month: "short", timeZone: "UTC" });
}

function list(labels: string[], locale: string): string {
  return new Intl.ListFormat(locale, { style: "long", type: "conjunction" }).format(labels);
}

function MetricCard({ trend, today }: { trend: MetricTrend; today: string }) {
  const t = useTranslations("profile.forma.metric");
  const tMetrics = useTranslations("metrics");
  const locale = useLocale() as Locale;
  const latest = trend.latest!;
  const age = daysBetween(latest.date, today);
  const spec = BODY_METRICS[trend.key];
  // The big number is a single data point (the latest), the sentence compares averages: say so.
  const latestText = spec.latest
    ? t("latestWithDate", { label: tMetrics(`body.${trend.key}.latest`), date: shortDate(latest.date, locale) })
    : age > 1 ? t("latestData", { date: shortDate(latest.date, locale) }) : null;
  return (
    <div className="surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow truncate">{trend.label}</p>
          <p className="mt-1 flex items-baseline gap-1 font-display text-2xl font-semibold leading-none tabular-nums tracking-tight">
            {formatMetric(trend.key, latest.value, locale)}
            {trend.unit && <span className="font-sans text-caption font-medium tracking-normal text-muted-foreground">{trend.unit}</span>}
          </p>
          {latestText && <p className="mt-1 text-micro text-muted-foreground">{latestText}</p>}
        </div>
        <TrendBadge trend={trend} className="mt-0.5 shrink-0" />
      </div>
      <div className="mt-3">
        <TrendChart metric={trend.key} series={trend.series} today={today} label={trend.label} />
      </div>
      <p className="mt-2 text-caption text-muted-foreground">{trend.sentence}</p>
      <details className="group mt-2 text-caption">
        <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 font-medium text-primary [&::-webkit-details-marker]:hidden">
          {t("about")}
          <ChevronDown size={14} aria-hidden className="transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none" />
        </summary>
        <p className="text-muted-foreground">{tMetrics(`body.${trend.key}.about`)}</p>
      </details>
    </div>
  );
}

export function FormaView({
  today,
  load,
  formPoints,
  trends,
}: {
  today: string;
  load: ATLCTLResult;
  formPoints: FormPoint[];
  trends: Record<BodyMetricKey, MetricTrend>;
}) {
  const t = useTranslations("profile.forma");
  const tLoad = useTranslations("profile.loadStates");
  const locale = useLocale();
  const state = { label: tLoad(`${load.status}.label`), text: tLoad(`${load.status}.text`), tone: LOAD_TONES[load.status] };
  const better = SUMMARY_KEYS.filter((key) => trends[key].direction === "better").map((key) => t(`summary.labels.${key}`));
  const worse = SUMMARY_KEYS.filter((key) => trends[key].direction === "worse").map((key) => t(`summary.labels.${key}`));
  const groups = GROUPS
    .map((group) => ({ ...group, trends: group.keys.map((key) => trends[key]).filter((trend) => trend.latest != null) }))
    .filter((group) => group.trends.length > 0);
  const hasWatch = (["vo2max", "restingHr", "sleep", "hrv", "stress"] as const).some((key) => trends[key].latest != null);
  const fitness = trends.fitness;
  const ratio = load.load_ratio;

  return (
    <AppShell wide title={t("title")} backHref="/profile" backLabel={t("back")}>
      <div className="stagger">
        <section className="surface mb-8 p-5">
          <p className="eyebrow">{t("summary.eyebrow")}</p>
          {better.length || worse.length ? (
            <div className="mt-2 space-y-1.5 text-body">
              {better.length > 0 && (
                <p>
                  {t.rich("summary.better", {
                    list: list(better, locale),
                    good: (chunks) => <span className="font-semibold text-emerald-600 dark:text-emerald-400">{chunks}</span>,
                  })}
                </p>
              )}
              {worse.length > 0 && (
                <p>
                  {t.rich("summary.worse", {
                    list: list(worse, locale),
                    bad: (chunks) => <span className="font-semibold text-orange-600 dark:text-orange-400">{chunks}</span>,
                  })}
                </p>
              )}
            </div>
          ) : (
            <p className="mt-2 text-body text-muted-foreground">{t("summary.none")}</p>
          )}
          <p className="mt-3 text-caption text-muted-foreground">{t("summary.comparison")}</p>
        </section>

        <div className="lg:grid lg:grid-cols-2 lg:gap-x-6 3xl:grid-cols-3">
          <Section title={t("load.title")} className="lg:col-span-2 3xl:col-span-3">
            <div className="surface p-4 lg:grid lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:gap-6">
              <div>
                <p className={cn("font-display text-title font-bold tracking-tight", state.tone)}>{state.label}</p>
                <p className="mt-1 text-caption text-muted-foreground">{state.text}</p>
                <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-4 border-t border-border/60 pt-4">
                  <Stat size="sm" label={t("load.form")} value={`${Math.round(load.ctl)}`} />
                  <Stat size="sm" label={t("load.fatigue")} value={`${Math.round(load.atl)}`} />
                  <Stat size="sm" label={t("load.freshness")} value={`${load.tsb > 0 ? "+" : ""}${Math.round(load.tsb)}`} />
                  <Stat size="sm" label={t("load.load7")} value={`${load.load7}`} />
                </div>
                <p className="mt-3 text-caption text-muted-foreground">
                  {ratio == null
                    ? t("load.calibrating")
                    : ratio > 1.15
                      ? t("load.above", { percent: String(Math.round(ratio * 100)) })
                      : ratio < 0.85
                        ? t("load.below", { percent: String(Math.round(ratio * 100)) })
                        : t("load.average")}
                  {fitness.direction && fitness.direction !== "stable" ? ` ${t("load.formSentence", { sentence: `${fitness.sentence.charAt(0).toLowerCase()}${fitness.sentence.slice(1)}` })}` : ""}
                </p>
              </div>
              {formPoints.length >= 3 && (
                <div className="mt-5 lg:mt-0">
                  <FormChart points={formPoints} />
                  <p className="mt-2 text-caption text-muted-foreground">{t("load.chartHint")}</p>
                </div>
              )}
            </div>
          </Section>

          {groups.map((group) => (
            <Section key={group.id} title={t(`groups.${group.id}`)} className={cn(group.trends.length > 1 && "lg:col-span-2 3xl:col-span-3")}>
              <div className="grid gap-3 lg:grid-cols-2 3xl:grid-cols-3">
                {group.trends.map((trend) => <MetricCard key={trend.key} trend={trend} today={today} />)}
              </div>
            </Section>
          ))}
        </div>

        {!hasWatch && (
          <p className="mb-6 px-1 text-caption text-muted-foreground">
            {t("noWatch")}
          </p>
        )}

        <Section title={t("notes.title")}>
          <ul className="surface list-disc space-y-1.5 py-4 pl-9 pr-4 text-caption text-muted-foreground">
            <li>{t("notes.zepp")}</li>
            <li>{t("notes.hrv")}</li>
            <li>{t("notes.missing")}</li>
            <li>{t("notes.metersPerBeat")}</li>
          </ul>
        </Section>
      </div>
    </AppShell>
  );
}

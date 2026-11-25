import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@/i18n/config";
import { ChevronRight, Flag, Settings } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/section";
import { SegmentedTabs } from "@/components/segmented-tabs";
import { FormChart, type FormPoint } from "@/components/charts/form-chart";
import { WeekBars, type WeekBar } from "@/components/charts/week-bars";
import { Predictions } from "@/components/progress/predictions";
import { Records } from "@/components/progress/records";
import { PaceHistory, type PaceSession } from "@/components/progress/pace-history";
import { FormStatus, type FormHighlight } from "@/components/progress/form-status";
import { formatDistance, formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PersonalRecord } from "@/lib/metrics/best-efforts";
import type { PredictionReference } from "@/lib/metrics/race-prediction";
import type { EnduranceBase } from "@/lib/metrics/predict";
import type { ATLCTLResult, Goal } from "@/lib/types";
import type { WellnessDay, ZeppDailyMetric, ZeppReadinessResult } from "@/lib/zepp/types";

export interface ProfileViewProps {
  displayName: string;
  initials: string;
  goal: Pick<Goal, "race_name" | "race_date" | "distance_m" | "target_time_s"> | null;
  daysToRace: number | null;
  load: ATLCTLResult;
  zepp: { latest: ZeppDailyMetric | null; readiness: ZeppReadinessResult | null; stale: boolean; wellness: WellnessDay | null; lastSync: string | null };
  hasData: boolean;
  /** VO₂max, load and sleep featured, with the trend direction. */
  highlights: FormHighlight[];
  formPoints: FormPoint[];
  formTrend: string | null;
  weeks: WeekBar[];
  currentWeek: string;
  reference: PredictionReference | null;
  /** Recent volume and long run: widen the forecast range. */
  endurance: EnduranceBase;
  /** Today in Rome (YYYY-MM-DD). */
  today: string;
  records: PersonalRecord[];
  paceSessions: PaceSession[];
}

type Tab = { key: string; label: string; content: React.ReactElement };

/** One card with tabs on the phone up to 2xl; on wide screens the
    *  views sit side by side, each in its own card with its own title. */
function TabbedCard({ tabs }: { tabs: Tab[] }) {
  return (
    <>
      <div className={cn("surface p-4", tabs.length > 1 && "2xl:hidden")}>
        <SegmentedTabs tabs={tabs} />
      </div>
      {tabs.length > 1 && (
        <div className="hidden gap-4 2xl:grid 2xl:grid-cols-2">
          {tabs.map((tab) => (
            <div key={tab.key} className="surface p-4">
              <h3 className="mb-4 text-body font-semibold">{tab.label}</h3>
              {tab.content}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export function ProfileView(props: ProfileViewProps) {
  const t = useTranslations("profile.view");
  const tProfile = useTranslations("profile");
  const locale = useLocale() as Locale;
  const { goal, daysToRace } = props;
  const trends = [
    props.formPoints.length >= 3 && {
      key: "form",
      label: t("trends.form"),
      content: (
        <>
          <FormChart points={props.formPoints} />
          <p className="mt-3 text-caption text-muted-foreground">
            {props.formTrend ?? t("trends.formHint")}
          </p>
        </>
      ),
    },
    props.weeks.some((week) => week.done_m > 0 || week.planned_m > 0) && {
      key: "km",
      label: t("trends.km"),
      content: <WeekBars weeks={props.weeks} current={props.currentWeek} />,
    },
  ].filter((tab): tab is Tab => Boolean(tab));
  const performance = [
    props.reference && {
      key: "predictions",
      label: t("performance.predictions"),
      content: <Predictions reference={props.reference} base={props.endurance} today={props.today} goal={goal} />,
    },
    props.records.length > 0 && {
      key: "records",
      label: t("performance.records"),
      content: <Records records={props.records} />,
    },
  ].filter((tab): tab is Tab => Boolean(tab));
  const pace = props.paceSessions.length > 0 && (
    <div className="surface p-4">
      <PaceHistory sessions={props.paceSessions} />
    </div>
  );

  return (
    <AppShell
      wide
      title={tProfile("title")}
      headerAction={
        <Button asChild variant="ghost" size="icon-sm" className="-mr-2">
          <Link href="/settings" aria-label={t("settingsAria")} title={t("settings")}>
            <Settings size={20} />
          </Link>
        </Button>
      }
    >
      {/* Desktop: person, fitness status, goal and pace in fast sessions
          in a fixed left column, charts on the right. On phones the
          column container generates no box (contents) and the animated
          sequence stays the same; pace stays at the bottom of the page. */}
      <div className="stagger lg:grid lg:grid-cols-[24rem_minmax(0,1fr)] lg:gap-x-8 3xl:grid-cols-[28rem_minmax(0,1fr)] 3xl:gap-x-10">
        <div className="stagger contents lg:sticky lg:top-0 lg:col-start-1 lg:row-span-[999] lg:row-start-1 lg:block lg:self-start">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-body font-bold text-primary-foreground">{props.initials}</div>
          <p className="min-w-0 truncate font-display text-heading font-bold tracking-tight">{props.displayName}</p>
        </div>

        <div className="mb-3">
          <FormStatus
            load={props.load}
            readiness={props.zepp.readiness}
            latest={props.zepp.latest}
            wellness={props.zepp.wellness}
            stale={props.zepp.stale}
            lastSync={props.zepp.lastSync}
            hasData={props.hasData}
            highlights={props.highlights}
            href="/profile/forma"
          />
        </div>

        <Link href="/goals" className="pressable surface mb-8 flex items-center gap-3 px-4 py-4">
          <Flag size={20} strokeWidth={2.2} className="shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="eyebrow">{t("goal.eyebrow")}</p>
            {goal ? (
              <p className="truncate text-body font-semibold">
                {goal.race_name}
                <span className="font-normal text-muted-foreground">
                  {" · "}{formatDistance(goal.distance_m, locale)}
                  {goal.target_time_s ? ` ${t("goal.inTime", { time: formatDuration(goal.target_time_s) })}` : ""}
                </span>
              </p>
            ) : (
              <p className="text-body font-semibold">{t("goal.unset")}</p>
            )}
          </div>
          {daysToRace != null && daysToRace >= 0 && (
            <span className="shrink-0 font-display text-heading font-bold tabular-nums tracking-tight text-primary">
              {daysToRace === 0 ? t("goal.today") : daysToRace === 1 ? t("goal.tomorrow") : t("goal.days", { days: String(daysToRace) })}
            </span>
          )}
          <ChevronRight size={16} className="shrink-0 text-muted-foreground/60" />
        </Link>

        {pace && (
          <Section title={t("pace")} className="hidden lg:block">
            {pace}
          </Section>
        )}
        </div>

        {trends.length === 0 && performance.length === 0 && (
          <p className="px-1 text-caption text-muted-foreground">
            {t("emptyHint")}
          </p>
        )}

        {trends.length > 0 && (
          <Section title={t("trends.title")}>
            <TabbedCard tabs={trends} />
          </Section>
        )}

        {performance.length > 0 && (
          <Section title={t("performance.title")}>
            <TabbedCard tabs={performance} />
          </Section>
        )}

        {pace && (
          <Section title={t("pace")} className="lg:hidden">
            {pace}
          </Section>
        )}
      </div>
    </AppShell>
  );
}

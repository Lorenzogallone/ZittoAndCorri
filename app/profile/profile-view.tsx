import Link from "next/link";
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
import { FormStatus } from "@/components/progress/form-status";
import { formatDistance, formatDuration } from "@/lib/format";
import type { PersonalRecord } from "@/lib/metrics/best-efforts";
import type { PredictionReference } from "@/lib/metrics/race-prediction";
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
  formPoints: FormPoint[];
  formTrend: string | null;
  weeks: WeekBar[];
  currentWeek: string;
  reference: PredictionReference | null;
  records: PersonalRecord[];
  paceSessions: PaceSession[];
}

export function ProfileView(props: ProfileViewProps) {
  const { goal, daysToRace } = props;
  const trends = [
    props.formPoints.length >= 3 && {
      key: "form",
      label: "Forma e fatica",
      content: (
        <>
          <FormChart points={props.formPoints} />
          <p className="mt-3 text-caption text-muted-foreground">
            {props.formTrend ?? "Forma: allenamento delle ultime 6 settimane. Fatica: quello degli ultimi 7 giorni."}
          </p>
        </>
      ),
    },
    props.weeks.some((week) => week.done_m > 0 || week.planned_m > 0) && {
      key: "km",
      label: "Km a settimana",
      content: <WeekBars weeks={props.weeks} current={props.currentWeek} />,
    },
  ].filter((tab): tab is { key: string; label: string; content: React.ReactElement } => Boolean(tab));
  const performance = [
    props.reference && {
      key: "predictions",
      label: "Previsioni",
      content: <Predictions reference={props.reference} goal={goal} />,
    },
    props.records.length > 0 && {
      key: "records",
      label: "Record",
      content: <Records records={props.records} />,
    },
  ].filter((tab): tab is { key: string; label: string; content: React.ReactElement } => Boolean(tab));

  return (
    <AppShell
      wide
      title="Profilo"
      headerAction={
        <Button asChild variant="ghost" size="icon-sm" className="-mr-2">
          <Link href="/settings" aria-label="Apri impostazioni" title="Impostazioni">
            <Settings size={20} />
          </Link>
        </Button>
      }
    >
      {/* Desktop: persona, stato di forma e obiettivo in una colonna fissa a
          sinistra, grafici a destra. Sul telefono il contenitore della colonna
          non genera box (contents) e la sequenza animata resta la stessa. */}
      <div className="stagger lg:grid lg:grid-cols-[24rem_minmax(0,1fr)] lg:gap-x-8">
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
          />
        </div>

        <Link href="/goals" className="pressable surface mb-8 flex items-center gap-3 px-4 py-4">
          <Flag size={20} strokeWidth={2.2} className="shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="eyebrow">Obiettivo</p>
            {goal ? (
              <p className="truncate text-body font-semibold">
                {goal.race_name}
                <span className="font-normal text-muted-foreground">
                  {" · "}{formatDistance(goal.distance_m)}
                  {goal.target_time_s ? ` in ${formatDuration(goal.target_time_s)}` : ""}
                </span>
              </p>
            ) : (
              <p className="text-body font-semibold">Da impostare</p>
            )}
          </div>
          {daysToRace != null && daysToRace >= 0 && (
            <span className="shrink-0 font-display text-heading font-bold tabular-nums tracking-tight text-primary">
              {daysToRace === 0 ? "Oggi" : daysToRace === 1 ? "Domani" : `${daysToRace} gg`}
            </span>
          )}
          <ChevronRight size={16} className="shrink-0 text-muted-foreground/60" />
        </Link>
        </div>

        {trends.length === 0 && performance.length === 0 && (
          <p className="px-1 text-caption text-muted-foreground">
            Con le prime corse qui compaiono l&apos;andamento della forma, i km a settimana, le previsioni di gara e i record.
          </p>
        )}

        {trends.length > 0 && (
          <Section title="Andamento">
            <div className="surface p-4">
              <SegmentedTabs tabs={trends} />
            </div>
          </Section>
        )}

        {performance.length > 0 && (
          <Section title="Prestazioni">
            <div className="surface p-4">
              <SegmentedTabs tabs={performance} />
            </div>
          </Section>
        )}

        {props.paceSessions.length > 0 && (
          <Section title="Passo nelle sedute veloci">
            <div className="surface p-4">
              <PaceHistory sessions={props.paceSessions} />
            </div>
          </Section>
        )}
      </div>
    </AppShell>
  );
}

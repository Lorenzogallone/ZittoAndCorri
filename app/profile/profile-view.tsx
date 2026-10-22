import Link from "next/link";
import { ChevronRight, Settings } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
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
  zepp: { latest: ZeppDailyMetric | null; readiness: ZeppReadinessResult | null; stale: boolean; wellness: WellnessDay | null };
  hasData: boolean;
  formPoints: FormPoint[];
  formTrend: string | null;
  weeks: WeekBar[];
  currentWeek: string;
  reference: PredictionReference | null;
  records: PersonalRecord[];
  paceSessions: PaceSession[];
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-[15px] font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
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
          <p className="mt-3 text-xs text-muted-foreground">
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
      title="Profilo"
      headerAction={
        <Button asChild variant="ghost" size="icon-sm" className="-mr-2">
          <Link href="/settings" aria-label="Apri impostazioni" title="Impostazioni">
            <Settings size={20} />
          </Link>
        </Button>
      }
    >
      <div className="stagger">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/12 text-sm font-bold text-primary">{props.initials}</div>
          <p className="truncate text-lg font-semibold">{props.displayName}</p>
        </div>

        <div className="mb-3">
          <FormStatus
            load={props.load}
            readiness={props.zepp.readiness}
            latest={props.zepp.latest}
            wellness={props.zepp.wellness}
            stale={props.zepp.stale}
            hasData={props.hasData}
          />
        </div>

        <Link href="/goals" className="surface mb-8 flex items-center gap-3 px-5 py-4 transition-transform active:scale-[0.99]">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">Obiettivo</p>
            {goal ? (
              <p className="truncate text-[15px] font-semibold">
                {goal.race_name}
                <span className="font-normal text-muted-foreground">
                  {" · "}{formatDistance(goal.distance_m)}
                  {goal.target_time_s ? ` in ${formatDuration(goal.target_time_s)}` : ""}
                </span>
              </p>
            ) : (
              <p className="text-[15px] font-semibold">Da impostare</p>
            )}
          </div>
          {daysToRace != null && daysToRace >= 0 && (
            <span className="shrink-0 text-sm font-semibold tabular-nums text-primary">
              {daysToRace === 0 ? "Oggi" : daysToRace === 1 ? "Domani" : `${daysToRace} gg`}
            </span>
          )}
          <ChevronRight size={16} className="shrink-0 text-muted-foreground/60" />
        </Link>

        {trends.length > 0 && (
          <Block title="Andamento">
            <div className="surface p-4">
              <SegmentedTabs tabs={trends} />
            </div>
          </Block>
        )}

        {performance.length > 0 && (
          <Block title="Prestazioni">
            <div className="surface p-4">
              <SegmentedTabs tabs={performance} />
            </div>
          </Block>
        )}

        {props.paceSessions.length > 0 && (
          <Block title="Passo nelle sedute veloci">
            <div className="surface p-4">
              <PaceHistory sessions={props.paceSessions} />
            </div>
          </Block>
        )}
      </div>
    </AppShell>
  );
}

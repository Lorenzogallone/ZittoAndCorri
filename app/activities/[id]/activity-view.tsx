import Link from "next/link";
import { Trophy } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { SegmentedTabs } from "@/components/segmented-tabs";
import { ActivityEvaluation } from "@/components/activity-evaluation";
import { PaceCheckCard } from "@/components/pace-check-card";
import { ShareActivityButton } from "@/components/share-activity-button";
import { RoutePreview } from "@/components/activity/route-preview";
import { SeriesChart } from "@/components/activity/series-chart";
import { SplitsChart } from "@/components/activity/splits-chart";
import { ZonesBar } from "@/components/activity/zones-bar";
import { IntervalsCard } from "@/components/activity/intervals-card";
import { Stat } from "@/components/stat";
import { hasIntervals } from "@/lib/intervals-text";
import type { IntervalAnalysis } from "@/lib/metrics/intervals";
import { activeDuration, formatDuration, formatPace } from "@/lib/format";
import { EFFORTS, type PersonalRecord } from "@/lib/metrics/best-efforts";
import type { PaceCheck } from "@/lib/metrics/pace-check";
import { SPORT_LABELS, TYPE_LABELS } from "@/lib/activity-meta";
import type { Activity, Evaluation, GpsPoint, HrPoint, Split, TimeInZone } from "@/lib/types";

export interface ActivityViewProps {
  activity: Activity;
  gps: GpsPoint[] | null;
  hr: HrPoint[] | null;
  elevation: GpsPoint[] | null;
  splits: Split[] | null;
  zones: TimeInZone | null;
  records: PersonalRecord[];
  pace: { check: PaceCheck; workoutId: string } | null;
  intervals: IntervalAnalysis | null;
  evaluation: Pick<Evaluation, "summary" | "details" | "created_at" | "ai_usage"> | null;
  evaluationJob: { status: "pending" | "done" | "error"; error: string | null } | null;
  keyConfigured: boolean;
}

export function ActivityView(props: ActivityViewProps) {
  const { activity } = props;
  const isRun = activity.sport === "running";
  const duration = activeDuration(activity);
  const title = activity.source_title || (isRun ? TYPE_LABELS[activity.type] : SPORT_LABELS[activity.sport]);
  const date = new Date(activity.started_at).toLocaleString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Rome",
  });
  const stats = [
    { label: "Tempo", value: formatDuration(duration) },
    isRun && activity.avg_pace_s_km != null ? { label: "Passo", value: formatPace(activity.avg_pace_s_km).replace("/km", ""), unit: "/km" } : null,
    activity.avg_hr != null ? { label: "FC media", value: `${activity.avg_hr}`, unit: "bpm" } : null,
    activity.elevation_gain_m != null ? { label: "Dislivello", value: `${activity.elevation_gain_m}`, unit: "m" } : null,
    activity.avg_cadence_spm != null ? { label: "Cadenza", value: `${activity.avg_cadence_spm}`, unit: "spm" } : null,
    activity.max_hr != null ? { label: "FC max", value: `${activity.max_hr}`, unit: "bpm" } : null,
    activity.hr_drift_pct != null ? { label: "Deriva FC", value: `${activity.hr_drift_pct > 0 ? "+" : ""}${activity.hr_drift_pct}%` } : null,
    activity.rpe != null ? { label: "Fatica", value: `${activity.rpe}/10` } : null,
  ].filter((stat): stat is { label: string; value: string; unit?: string } => stat != null);

  const charts = [
    props.splits?.length ? { key: "pace", label: "Passo", content: <SplitsChart splits={props.splits} /> } : null,
    props.hr && props.hr.length >= 2
      ? { key: "hr", label: "Cuore", content: <SeriesChart points={props.hr.map((p) => ({ t: p.t, v: p.bpm }))} color="#ef4444" unit="bpm" /> }
      : null,
    props.elevation && props.elevation.length >= 2
      ? {
          key: "ele",
          label: "Quota",
          content: <SeriesChart points={props.elevation.filter((p) => p.ele != null).map((p) => ({ t: p.t, v: Math.round(p.ele!) }))} color="var(--viz-1)" unit="m" />,
        }
      : null,
  ].filter((tab): tab is { key: string; label: string; content: React.ReactElement } => tab != null);

  return (
    <AppShell
      backHref="/activities"
      backLabel="Corse"
      hideTabBar
      headerAction={
        <div className="-mr-2 flex items-center gap-1">
          <ShareActivityButton activityId={activity.id} title={title} />
          {/* replace: dopo il salvataggio "indietro" torna alla lista, non al form. */}
          <Link href={`/activities/${activity.id}/edit`} replace className="px-2 text-body font-medium text-primary active:opacity-50">
            Modifica
          </Link>
        </div>
      }
    >
      <div className="stagger">
        <header className="mb-6">
          <p className="text-sm text-muted-foreground first-letter:uppercase">{date}</p>
          <p className="mt-1 text-base font-medium">{title}</p>
          <h1 className="mt-1 font-display text-display-xl font-bold tabular-nums tracking-tight">
            {activity.distance_m > 0 ? (
              <>
                {(activity.distance_m / 1000).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                <span className="ml-1.5 text-title font-semibold text-muted-foreground">km</span>
              </>
            ) : (
              formatDuration(duration)
            )}
          </h1>
          {props.records.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {props.records.map((record) => (
                <span key={record.key} className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
                  <Trophy size={13} /> Record {EFFORTS.find((effort) => effort.key === record.key)?.label} · {formatDuration(record.time_s)}
                </span>
              ))}
            </div>
          )}
        </header>

        <div className="mb-6 grid grid-cols-3 gap-x-4 gap-y-4">
          {stats.map((stat) => <Stat key={stat.label} {...stat} />)}
        </div>

        {props.gps && props.gps.length >= 2 && (
          <div className="mb-4">
            <RoutePreview gps={props.gps} />
          </div>
        )}

        {/* Le ripetute misurate includono già il confronto con il passo previsto. */}
        {hasIntervals(props.intervals) ? (
          <IntervalsCard analysis={props.intervals} workoutId={props.pace?.workoutId} canEditNote={props.keyConfigured} />
        ) : (
          props.pace && <PaceCheckCard check={props.pace.check} workoutId={props.pace.workoutId} />
        )}

        {charts.length > 0 && (
          <section className="surface mb-4 p-4">
            <SegmentedTabs tabs={charts} />
          </section>
        )}

        {props.zones && Object.values(props.zones).some((seconds) => (seconds ?? 0) > 0) && (
          <section className="surface mb-4 p-4">
            <h2 className="mb-3 text-body font-semibold">Zone cardiache</h2>
            <ZonesBar zones={props.zones} />
          </section>
        )}

        <ActivityEvaluation
          activityId={activity.id}
          initialNotes={activity.notes}
          evaluation={props.evaluation}
          initialAnalyzing={props.evaluationJob?.status === "pending"}
          initialFailed={props.evaluationJob?.status === "error"}
          initialError={props.evaluationJob?.status === "error" ? props.evaluationJob.error : null}
          keyConfigured={props.keyConfigured}
        />
      </div>
    </AppShell>
  );
}

"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Pause } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/format";
import { segmentToneKey, TONES } from "@/lib/step-tones";
import { useSegmentSelection } from "@/components/activity/segment-selection";
import type { IntervalAnalysis, IntervalSegment, IntervalSource } from "@/lib/metrics/intervals";

const clock = (seconds: number | null) => {
  if (seconds == null) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
};

/** Colori coerenti con il profilo della seduta prevista (WorkoutGraph) e con la mappa. */
const tone = (segment: IntervalSegment) => TONES[segmentToneKey(segment)];

/** Puntino del tratto: rispetto al range previsto se c'è, altrimenti il tipo. */
function dotTone(segment: IntervalSegment): string {
  if (segment.pace_deviation_s == null) return tone(segment).dot;
  if (segment.pace_deviation_s < 0) return "bg-sky-500";
  if (segment.pace_deviation_s > 0) return "bg-amber-500";
  return "bg-emerald-500";
}

/** Scarto dal range solo quando c'è: "nel range" lo dice già il puntino verde. */
function deviationText(segment: IntervalSegment): string | null {
  const d = segment.pace_deviation_s;
  if (!d) return null;
  return `${d > 0 ? "+" : "−"}${Math.abs(d)}″`;
}

/** Etichette lunghe del piano ("Ripetuta 1 km veloce") → la quantità: "1 km". */
function displayLabel(segment: IntervalSegment): string {
  if (segment.label.length <= 10 || !segment.target || (segment.kind !== "work" && segment.kind !== "steady")) return segment.label;
  const { type, value } = segment.target;
  if (type === "distance") return value >= 1000 ? `${String(value / 1000).replace(".", ",")} km` : `${value} m`;
  return value % 60 === 0 ? `${value / 60}'` : value < 120 ? `${value}"` : `${Math.floor(value / 60)}'${String(value % 60).padStart(2, "0")}"`;
}

/** Il passo dei tratti camminati (oltre 10:00/km) non dice nulla. */
const shownPace = (segment: IntervalSegment) =>
  segment.kind !== "work" && (segment.pace_s_km ?? 0) > 600 ? null : segment.pace_s_km;

/** Come è stata corsa la seduta: larghezza = durata, altezza = velocità. */
function ExecutedProfile({ segments }: { segments: IntervalSegment[] }) {
  const t = useTranslations("activities.intervals");
  const speeds = segments.map((s) => (s.pace_s_km ? 1000 / s.pace_s_km : 0));
  const moving = speeds.filter((v) => v > 0);
  const lo = Math.min(...moving) * 0.85;
  const hi = Math.max(...moving);
  const total = segments.reduce((sum, s) => sum + s.duration_s, 0);
  return (
    <div className="mt-4 flex h-12 items-end gap-[2px]" role="img" aria-label={t("profileAria")}>
      {segments.map((segment, index) => {
        const ratio = speeds[index] > 0 && hi > lo ? (speeds[index] - lo) / (hi - lo) : 0;
        return (
          <div
            key={index}
            className={cn("animate-grow-y min-w-[3px] rounded-t-[3px] rounded-b-[1px]", tone(segment).bar)}
            style={{
              flexGrow: segment.duration_s / total,
              flexBasis: 0,
              height: `${Math.round(18 + ratio * 82)}%`,
              animationDelay: `${Math.min(index * 25, 400)}ms`,
            }}
          />
        );
      })}
    </div>
  );
}

function Row({ segment, muted, selected, onSelect }: { segment: IntervalSegment; muted: boolean; selected: boolean; onSelect: () => void }) {
  const t = useTranslations("activities.intervals");
  const deviation = deviationText(segment);
  // Riga intera toccabile (sottogriglia): evidenzia il tratto nel grafico e sulla mappa.
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "col-span-5 -mx-2 grid grid-cols-subgrid rounded-lg px-2 text-left transition-colors motion-reduce:transition-none",
        selected ? "bg-muted" : "hover:bg-muted/50",
      )}
    >
      <div className={cn("flex min-w-0 items-center gap-2 border-t border-border/50 py-2", muted ? "text-muted-foreground" : "font-medium")}>
        <span className={cn("h-2 w-2 shrink-0 rounded-full", dotTone(segment))} />
        <span className="line-clamp-2 break-words leading-snug first-letter:uppercase">{displayLabel(segment)}</span>
        {segment.rep != null && <span className="shrink-0 text-xs font-normal text-muted-foreground tabular-nums">{segment.rep}/{segment.reps}</span>}
        {(segment.paused_s ?? 0) >= 5 && (
          <span className="inline-flex shrink-0 items-center gap-0.5 text-xs font-normal text-muted-foreground tabular-nums" title={t("pausedTitle")}>
            <Pause size={10} aria-hidden />
            <span className="sr-only">{t("paused")}</span>
            {clock(segment.paused_s!)}
          </span>
        )}
        {segment.variant === "sprint" && segment.max_speed_kmh != null && (
          <span className="shrink-0 text-xs font-normal text-muted-foreground tabular-nums" title={t("topSpeedTitle")}>
            {String(segment.max_speed_kmh).replace(".", ",")} km/h
          </span>
        )}
      </div>
      <div className={cn("border-t border-border/50 py-2 text-right tabular-nums", muted && "text-muted-foreground")}>{formatDuration(segment.duration_s)}</div>
      <div className={cn("border-t border-border/50 py-2 text-right tabular-nums", muted ? "text-muted-foreground" : "font-semibold")}>
        {clock(shownPace(segment))}
        {deviation && !muted && <span className="ml-1 text-micro font-normal text-muted-foreground">{deviation}</span>}
      </div>
      <div className="border-t border-border/50 py-2 text-right tabular-nums text-muted-foreground">
        {segment.kind === "recovery" && segment.hr_drop != null && segment.hr_drop > 0
          ? <span title={t("hrRecovered")}>↓{segment.hr_drop}</span>
          : segment.avg_hr ?? "—"}
      </div>
      <div className="border-t border-border/50 py-2 text-right tabular-nums text-muted-foreground">{segment.cadence_spm ?? "—"}</div>
    </button>
  );
}

/** Tratti della seduta con tempo, passo, cuore e cadenza di ognuno; le pause a parte. */
export function IntervalsCard({
  analysis,
  workoutId,
  canEditNote,
}: {
  analysis: IntervalAnalysis;
  workoutId?: string | null;
  canEditNote: boolean;
}) {
  const t = useTranslations("activities.intervals");
  const tStatus = useTranslations("status");
  const s = analysis.summary;
  const source = analysis.source as IntervalSource;
  const { selected, toggle, segments: spans } = useSegmentSelection();
  const summary = [
    s?.avg_pace_s_km ? t("average", { pace: clock(s.avg_pace_s_km) }) : null,
    s?.fastest_pace_s_km && s.slowest_pace_s_km && s.fastest_pace_s_km !== s.slowest_pace_s_km
      ? t("range", { fastest: clock(s.fastest_pace_s_km), slowest: clock(s.slowest_pace_s_km) })
      : null,
    s?.fade_pct != null && Math.abs(s.fade_pct) >= 0.5
      ? t(s.fade_pct > 0 ? "fadeSlower" : "fadeFaster", { pct: String(Math.abs(s.fade_pct)).replace(".", ",") })
      : s?.fade_pct != null ? t("regular") : null,
  ].filter(Boolean).join(" · ");
  const kmh = (value: number) => `${String(value).replace(".", ",")} km/h`;
  const sprintTop = analysis.segments.filter((x) => x.variant === "sprint").map((x) => x.max_speed_kmh ?? 0);
  // Sprint insieme ai tratti veloci: riga a parte. Solo sprint: basta la punta.
  const sprint = s?.sprint
    ? [s.sprint.avg_pace_s_km ? t("sprintPace", { pace: clock(s.sprint.avg_pace_s_km) }) : t("sprint"), s.sprint.max_speed_kmh ? t("sprintTop", { speed: kmh(s.sprint.max_speed_kmh) }) : null].filter(Boolean).join(" · ")
    : s?.main === "sprint" && Math.max(0, ...sprintTop) > 0 ? t("topOnly", { speed: kmh(Math.max(...sprintTop)) }) : null;

  return (
    <section className="surface p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-body font-semibold">{t("title")}</h2>
        {source === "plan" && workoutId ? (
          <Link href={`/plan/${workoutId}`} className="text-xs text-primary">{tStatus(`intervals.source.${source}`)}</Link>
        ) : (
          <span className="text-xs text-muted-foreground">{tStatus(`intervals.source.${source}`)}</span>
        )}
      </div>
      {analysis.description && <p className="mt-1 text-xl font-bold tracking-tight">{analysis.description}</p>}
      {summary && <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">{summary}</p>}
      {sprint && <p className="text-xs text-muted-foreground tabular-nums">{sprint}</p>}
      {analysis.contradicts_plan && (
        <p className="mt-2 text-xs text-muted-foreground">
          {t("contradictsPlan", { planned: tStatus(`intervals.plannedContinuous.${analysis.contradicts_plan}`) })}
          {workoutId && <> <Link href={`/plan/${workoutId}`} className="text-primary">{t("viewSession")}</Link></>}
        </p>
      )}

      <ExecutedProfile segments={analysis.segments} />

      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] gap-x-3 text-sm sm:gap-x-4">
        <div />
        <div className="pb-1 text-right text-micro text-muted-foreground">{t("columns.time")}</div>
        <div className="pb-1 text-right text-micro text-muted-foreground">{t("columns.pace")}</div>
        <div className="pb-1 text-right text-micro text-muted-foreground">{t("columns.hr")}</div>
        <div className="pb-1 text-right text-micro text-muted-foreground" title={t("columns.cadenceTitle")}>{t("columns.cadence")}</div>
        {analysis.segments.map((segment, index) => (
          <Row
            key={index}
            segment={segment}
            muted={segment.kind !== "work" && segment.kind !== "steady"}
            selected={selected === index}
            onSelect={() => toggle(index)}
          />
        ))}
      </div>
      {spans.length > 0 && (
        <p className="mt-2 text-micro text-muted-foreground" aria-live="polite">
          {selected == null ? t("hintIdle") : t("hintSelected")}
        </p>
      )}

      {canEditNote && (
        <a href="#nota" className="mt-3 block text-xs text-primary">
          {source === "notes" ? t("fixNote") : t("wrongNote")}
        </a>
      )}
    </section>
  );
}

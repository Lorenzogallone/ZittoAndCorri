import Link from "next/link";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/format";
import { INTERVAL_SOURCE_LABELS } from "@/lib/intervals-text";
import { TONES } from "@/lib/step-tones";
import type { IntervalAnalysis, IntervalSegment, IntervalSource } from "@/lib/metrics/intervals";

const clock = (seconds: number | null) => {
  if (seconds == null) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
};

/** Colori coerenti con il profilo della seduta prevista (WorkoutGraph). */
function tone(segment: IntervalSegment) {
  if (segment.variant === "sprint") return TONES.sprint;
  if (segment.variant === "walk" || segment.variant === "stop") return TONES.walk;
  if (segment.kind === "work") return TONES.hard;
  if (segment.kind === "steady") return TONES.tempo;
  if (segment.kind === "recovery") return TONES.jog;
  return TONES.easy;
}

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
  const speeds = segments.map((s) => (s.pace_s_km ? 1000 / s.pace_s_km : 0));
  const moving = speeds.filter((v) => v > 0);
  const lo = Math.min(...moving) * 0.85;
  const hi = Math.max(...moving);
  const total = segments.reduce((sum, s) => sum + s.duration_s, 0);
  return (
    <div className="mt-4 flex h-12 items-end gap-[2px]" role="img" aria-label="Profilo della corsa: blocchi più alti sono tratti più veloci">
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

function Row({ segment, muted }: { segment: IntervalSegment; muted: boolean }) {
  const deviation = deviationText(segment);
  return (
    <>
      <div className={cn("flex min-w-0 items-center gap-2 border-t border-border/50 py-2", muted ? "text-muted-foreground" : "font-medium")}>
        <span className={cn("h-2 w-2 shrink-0 rounded-full", dotTone(segment))} />
        <span className="truncate first-letter:uppercase">{displayLabel(segment)}</span>
        {segment.rep != null && <span className="shrink-0 text-xs font-normal text-muted-foreground tabular-nums">{segment.rep}/{segment.reps}</span>}
        {segment.variant === "sprint" && segment.max_speed_kmh != null && (
          <span className="shrink-0 text-xs font-normal text-muted-foreground tabular-nums" title="Velocità di punta">
            {String(segment.max_speed_kmh).replace(".", ",")} km/h
          </span>
        )}
      </div>
      <div className={cn("border-t border-border/50 py-2 text-right tabular-nums", muted && "text-muted-foreground")}>{formatDuration(segment.duration_s)}</div>
      <div className={cn("border-t border-border/50 py-2 text-right tabular-nums", muted ? "text-muted-foreground" : "font-semibold")}>
        {clock(shownPace(segment))}
        {deviation && !muted && <span className="ml-1 text-[11px] font-normal text-muted-foreground">{deviation}</span>}
      </div>
      <div className="border-t border-border/50 py-2 text-right tabular-nums text-muted-foreground">
        {segment.kind === "recovery" && segment.hr_drop != null && segment.hr_drop > 0
          ? <span title="Battiti recuperati">↓{segment.hr_drop}</span>
          : segment.avg_hr ?? "—"}
      </div>
    </>
  );
}

/** Tratti della seduta con tempo, passo e cuore di ognuno. */
export function IntervalsCard({
  analysis,
  workoutId,
  canEditNote,
}: {
  analysis: IntervalAnalysis;
  workoutId?: string | null;
  canEditNote: boolean;
}) {
  const s = analysis.summary;
  const source = analysis.source as IntervalSource;
  const summary = [
    s?.avg_pace_s_km ? `Media ${clock(s.avg_pace_s_km)}/km` : null,
    s?.fastest_pace_s_km && s.slowest_pace_s_km && s.fastest_pace_s_km !== s.slowest_pace_s_km
      ? `da ${clock(s.fastest_pace_s_km)} a ${clock(s.slowest_pace_s_km)}`
      : null,
    s?.fade_pct != null && Math.abs(s.fade_pct) >= 0.5
      ? `ultima ${s.fade_pct > 0 ? "più lenta" : "più veloce"} del ${String(Math.abs(s.fade_pct)).replace(".", ",")}%`
      : s?.fade_pct != null ? "ripetute regolari" : null,
  ].filter(Boolean).join(" · ");
  const kmh = (value: number) => `${String(value).replace(".", ",")} km/h`;
  const sprintTop = analysis.segments.filter((x) => x.variant === "sprint").map((x) => x.max_speed_kmh ?? 0);
  // Sprint insieme ai tratti veloci: riga a parte. Solo sprint: basta la punta.
  const sprint = s?.sprint
    ? [`Sprint ${s.sprint.avg_pace_s_km ? `${clock(s.sprint.avg_pace_s_km)}/km` : ""}`.trim(), s.sprint.max_speed_kmh ? `punta ${kmh(s.sprint.max_speed_kmh)}` : null].filter(Boolean).join(" · ")
    : s?.main === "sprint" && Math.max(0, ...sprintTop) > 0 ? `Punta ${kmh(Math.max(...sprintTop))}` : null;

  return (
    <section className="surface mb-4 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-semibold">Ripetute</h2>
        {source === "plan" && workoutId ? (
          <Link href={`/plan/${workoutId}`} className="text-xs text-primary">{INTERVAL_SOURCE_LABELS[source]}</Link>
        ) : (
          <span className="text-xs text-muted-foreground">{INTERVAL_SOURCE_LABELS[source]}</span>
        )}
      </div>
      {analysis.description && <p className="mt-1 text-xl font-bold tracking-tight">{analysis.description}</p>}
      {summary && <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">{summary}</p>}
      {sprint && <p className="text-xs text-muted-foreground tabular-nums">{sprint}</p>}

      <ExecutedProfile segments={analysis.segments} />

      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-x-4 text-sm">
        <div />
        <div className="pb-1 text-right text-[11px] text-muted-foreground">Tempo</div>
        <div className="pb-1 text-right text-[11px] text-muted-foreground">Passo</div>
        <div className="pb-1 text-right text-[11px] text-muted-foreground">FC</div>
        {analysis.segments.map((segment, index) => (
          <Row key={index} segment={segment} muted={segment.kind !== "work" && segment.kind !== "steady"} />
        ))}
      </div>

      {canEditNote && (
        <a href="#nota" className="mt-3 block text-xs text-primary">
          {source === "notes" ? "Correggi la struttura nella nota" : "Non torna? Scrivi com'era la seduta nella nota"}
        </a>
      )}
    </section>
  );
}

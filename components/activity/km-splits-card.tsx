"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useSegmentSelection } from "@/components/activity/segment-selection";
import type { KmAnalysis, KmSplit } from "@/lib/metrics/km-splits";

const clock = (seconds: number | null) => {
  if (seconds == null) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
};

const signed = (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value)}`;

/** Km parziale (l'ultimo): la distanza al posto del numero. */
const kmLabel = (split: KmSplit) =>
  split.distance_m >= 990 ? `${split.km}` : `${(split.distance_m / 1000).toLocaleString("it-IT", { maximumFractionDigits: 2 })} km`;

/** Seconda metà contro prima: passo e cuore, in parole. */
function halvesText(analysis: KmAnalysis, t: ReturnType<typeof useTranslations>): string | null {
  const h = analysis.halves;
  if (!h) return null;
  const pace = Math.abs(h.pace_delta_s_km) < 3
    ? t("halvesSame")
    : t(h.pace_delta_s_km < 0 ? "halvesFaster" : "halvesSlower", { delta: Math.abs(h.pace_delta_s_km) });
  return h.hr_delta == null ? pace : t("halvesWithHr", { pace, delta: signed(h.hr_delta) });
}

function Row({ split, fastest, slowest, selected, onSelect }: { split: KmSplit; fastest: boolean; slowest: boolean; selected: boolean; onSelect: () => void }) {
  const t = useTranslations("activities.kmSplits");
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
      <div className="flex min-w-0 items-center gap-2 border-t border-border/50 py-2 font-medium tabular-nums">
        {kmLabel(split)}
        {fastest && <span className="text-xs font-normal text-muted-foreground">{t("fastest")}</span>}
        {slowest && <span className="text-xs font-normal text-muted-foreground">{t("slowest")}</span>}
      </div>
      <div className="border-t border-border/50 py-2 text-right font-semibold tabular-nums">{clock(split.pace_s_km)}</div>
      <div className="border-t border-border/50 py-2 text-right tabular-nums text-muted-foreground">{split.avg_hr ?? "—"}</div>
      <div className="border-t border-border/50 py-2 text-right tabular-nums text-muted-foreground">{split.cadence_spm ?? "—"}</div>
      <div className="border-t border-border/50 py-2 text-right tabular-nums text-muted-foreground">
        {split.elevation_m == null ? "—" : split.elevation_m === 0 ? "0" : signed(split.elevation_m)}
      </div>
    </button>
  );
}

/** Corsa continua km per km: passo, cuore, cadenza e dislivello di ogni chilometro. */
export function KmSplitsCard({ analysis }: { analysis: KmAnalysis }) {
  const t = useTranslations("activities.kmSplits");
  const { selected, toggle } = useSegmentSelection();
  const full = analysis.splits.filter((split) => split.distance_m >= 990);
  const paces = full.map((split) => split.pace_s_km);
  const fastest = paces.length >= 3 ? Math.min(...paces) : null;
  const slowest = paces.length >= 3 ? Math.max(...paces) : null;
  // Il passo medio è già tra i numeri in alto: qui solo l'escursione.
  const summary = fastest != null && slowest != null && fastest !== slowest
    ? t("summary", { fastest: clock(fastest), slowest: clock(slowest) })
    : null;
  const halves = halvesText(analysis, t);

  return (
    <section className="surface p-4">
      <h2 className="text-body font-semibold">{t("title")}</h2>
      {summary && <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">{summary}</p>}
      {halves && <p className="text-xs text-muted-foreground tabular-nums">{halves}</p>}

      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] gap-x-3 text-sm sm:gap-x-4">
        <div className="pb-1 text-micro text-muted-foreground">{t("columns.km")}</div>
        <div className="pb-1 text-right text-micro text-muted-foreground">{t("columns.pace")}</div>
        <div className="pb-1 text-right text-micro text-muted-foreground">{t("columns.hr")}</div>
        <div className="pb-1 text-right text-micro text-muted-foreground" title={t("columns.cadenceTitle")}>{t("columns.cadence")}</div>
        <div className="pb-1 text-right text-micro text-muted-foreground" title={t("columns.elevationTitle")}>{t("columns.elevation")}</div>
        {analysis.splits.map((split, index) => (
          <Row
            key={split.km}
            split={split}
            fastest={split.distance_m >= 990 && split.pace_s_km === fastest}
            slowest={split.distance_m >= 990 && split.pace_s_km === slowest}
            selected={selected === index}
            onSelect={() => toggle(index)}
          />
        ))}
      </div>
      <p className="mt-2 text-micro text-muted-foreground" aria-live="polite">
        {selected == null ? t("hintIdle") : t("hintSelected")}
      </p>
    </section>
  );
}

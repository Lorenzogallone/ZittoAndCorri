"use client";

import { useState } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Footprints, Mountain, Route, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { Segmented } from "@/components/ui/segmented";
import { Stat } from "@/components/stat";
import type { PeriodTotals, TotalsPeriodKey } from "@/lib/metrics/totals";

const km = (meters: number, digits = 1) =>
  (meters / 1000).toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: digits });

function hours(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h} h ${String(m).padStart(2, "0")}′` : `${m}′`;
}

function comparison(period: PeriodTotals): { text: string; trend: "up" | "down" | "flat" } | null {
  if (period.previous_m == null || period.previous_label == null) return null;
  if (period.previous_m === 0 && period.running_m === 0) return null;
  const diff = period.running_m - period.previous_m;
  if (Math.abs(diff) < 500) return { text: `In linea rispetto ${period.previous_label}`, trend: "flat" };
  return { text: `${diff > 0 ? "+" : "−"}${km(Math.abs(diff))} km rispetto ${period.previous_label}`, trend: diff > 0 ? "up" : "down" };
}

const TREND_ICONS = { up: ArrowUpRight, down: ArrowDownRight, flat: ArrowRight } as const;

/** Quanto hai corso: settimana, mese, anno e da sempre. */
export function TotalsCard({ periods, initial = "month" }: { periods: PeriodTotals[]; initial?: TotalsPeriodKey }) {
  const [active, setActive] = useState<TotalsPeriodKey>(initial);
  const period = periods.find((candidate) => candidate.key === active) ?? periods[0];
  const note = comparison(period);
  const TrendIcon = TREND_ICONS[note?.trend ?? "flat"];
  return (
    <section className="surface mb-8 p-4">
      <Segmented
        size="sm"
        ariaLabel="Periodo"
        options={periods.map(({ key, label }) => ({ key, label }))}
        value={active}
        onChange={setActive}
      />

      <div className="mt-5" role="tabpanel">
        <p className="eyebrow">{period.caption}</p>
        <p className="mt-1 flex items-baseline gap-1.5">
          <span className="font-display text-display font-bold tabular-nums tracking-tight">{km(period.running_m)}</span>
          <span className="text-heading font-medium text-muted-foreground">km</span>
        </p>
        {note && (
          <p
            className={cn(
              "mt-2 flex items-center gap-1 text-caption font-medium",
              note.trend === "up" ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
            )}
          >
            <TrendIcon size={15} strokeWidth={2.4} className="shrink-0" aria-hidden="true" />
            <span className="min-w-0">{note.text}</span>
          </p>
        )}

        {/* Due colonne: su telefono quattro tagliavano le etichette con l'icona. */}
        <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 border-t border-border/60 pt-4">
          <Stat size="sm" icon={Footprints} label="Uscite" value={String(period.runs)} />
          <Stat size="sm" icon={Timer} label="Tempo" value={hours(period.seconds)} />
          <Stat size="sm" icon={Mountain} label="Dislivello" value={Math.round(period.elevation_m).toLocaleString("it-IT")} unit="m" />
          <Stat size="sm" icon={Route} label="Più lunga" value={km(period.longest_m)} unit="km" />
        </div>
        {period.walking_m > 0 && (
          <p className="mt-3 text-caption text-muted-foreground">
            Più {km(period.walking_m)} km di camminate ed escursioni
          </p>
        )}
      </div>
    </section>
  );
}

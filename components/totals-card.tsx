"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { PeriodTotals, TotalsPeriodKey } from "@/lib/metrics/totals";

const km = (meters: number, digits = 1) =>
  (meters / 1000).toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: digits });

function hours(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h} h ${String(m).padStart(2, "0")}′` : `${m}′`;
}

function comparison(period: PeriodTotals): string | null {
  if (period.previous_m == null || period.previous_label == null) return null;
  if (period.previous_m === 0 && period.running_m === 0) return null;
  const diff = period.running_m - period.previous_m;
  if (Math.abs(diff) < 500) return `In linea rispetto ${period.previous_label}`;
  return `${diff > 0 ? "+" : "−"}${km(Math.abs(diff))} km rispetto ${period.previous_label}`;
}

/** Quanto hai corso: settimana, mese, anno e da sempre. */
export function TotalsCard({ periods, initial = "month" }: { periods: PeriodTotals[]; initial?: TotalsPeriodKey }) {
  const [active, setActive] = useState<TotalsPeriodKey>(initial);
  const period = periods.find((candidate) => candidate.key === active) ?? periods[0];
  const note = comparison(period);
  return (
    <section className="mb-6 rounded-2xl border border-border bg-card p-4">
      <div className="grid grid-cols-4 rounded-xl bg-muted p-0.5 text-xs font-medium" role="tablist" aria-label="Periodo">
        {periods.map((candidate) => (
          <button
            key={candidate.key}
            type="button"
            role="tab"
            aria-selected={candidate.key === active}
            onClick={() => setActive(candidate.key)}
            className={cn(
              "rounded-[10px] py-1.5 transition-colors",
              candidate.key === active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
            )}
          >
            {candidate.label}
          </button>
        ))}
      </div>

      <div className="mt-4" role="tabpanel">
        <p className="text-xs capitalize text-muted-foreground">{period.caption}</p>
        <p className="mt-0.5 text-4xl font-bold tracking-tight">
          {km(period.running_m)} <span className="text-lg font-semibold text-muted-foreground">km di corsa</span>
        </p>
        {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}

        <dl className="mt-4 grid grid-cols-4 gap-2 border-t border-border/60 pt-3">
          <div>
            <dt className="text-[10px] text-muted-foreground">Uscite</dt>
            <dd className="text-sm font-semibold tabular-nums">{period.runs}</dd>
          </div>
          <div>
            <dt className="text-[10px] text-muted-foreground">Tempo</dt>
            <dd className="text-sm font-semibold tabular-nums">{hours(period.seconds)}</dd>
          </div>
          <div>
            <dt className="text-[10px] text-muted-foreground">Dislivello</dt>
            <dd className="text-sm font-semibold tabular-nums">{Math.round(period.elevation_m).toLocaleString("it-IT")} m</dd>
          </div>
          <div>
            <dt className="text-[10px] text-muted-foreground">Più lunga</dt>
            <dd className="text-sm font-semibold tabular-nums">{km(period.longest_m)} km</dd>
          </div>
        </dl>
        {period.walking_m > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            Più {km(period.walking_m)} km di camminate ed escursioni
          </p>
        )}
      </div>
    </section>
  );
}

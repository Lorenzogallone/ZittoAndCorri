"use client";

import { useState } from "react";
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
    <section className="surface mb-8 p-4">
      <Segmented
        size="sm"
        ariaLabel="Periodo"
        options={periods.map(({ key, label }) => ({ key, label }))}
        value={active}
        onChange={setActive}
      />

      <div className="mt-4" role="tabpanel">
        <Stat size="lg" label={period.caption} value={km(period.running_m)} unit="km di corsa" />
        {note && <p className="mt-1.5 text-xs text-muted-foreground">{note}</p>}

        <div className="mt-4 grid grid-cols-4 gap-2 border-t border-border/60 pt-3">
          <Stat size="sm" label="Uscite" value={String(period.runs)} />
          <Stat size="sm" label="Tempo" value={hours(period.seconds)} />
          <Stat size="sm" label="Dislivello" value={Math.round(period.elevation_m).toLocaleString("it-IT")} unit="m" />
          <Stat size="sm" label="Più lunga" value={km(period.longest_m)} unit="km" />
        </div>
        {period.walking_m > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            Più {km(period.walking_m)} km di camminate ed escursioni
          </p>
        )}
      </div>
    </section>
  );
}

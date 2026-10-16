"use client";

import { useState } from "react";
import { niceTicks, roundedTopBar, useMeasuredWidth } from "./chart-utils";

export interface WeekBar {
  week_start: string;
  done_m: number;
  planned_m: number;
}

const HEIGHT = 140;
const PAD = { top: 18, right: 4, bottom: 22, left: 26 };

const km = (meters: number) => meters / 1000;
const kmLabel = (meters: number) => `${km(meters).toLocaleString("it-IT", { maximumFractionDigits: km(meters) >= 10 ? 0 : 1 })} km`;

function weekLabel(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("it-IT", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** Km di corsa per settimana: barra piena = fatti, traccia chiara = previsti. */
export function WeekBars({ weeks, current }: { weeks: WeekBar[]; current: string }) {
  const { ref, width } = useMeasuredWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  if (!weeks.length) return null;

  const innerW = Math.max(0, width - PAD.left - PAD.right);
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const ticks = niceTicks(Math.max(1, ...weeks.map((w) => km(Math.max(w.done_m, w.planned_m)))), 2);
  const top = ticks[ticks.length - 1];
  const slot = innerW / weeks.length;
  const barW = Math.min(24, slot * 0.62);
  const y = (meters: number) => PAD.top + innerH - (km(meters) / top) * innerH;
  const barX = (index: number) => PAD.left + slot * index + (slot - barW) / 2;
  const currentIndex = weeks.findIndex((w) => w.week_start === current);
  const labelEvery = weeks.length > 8 ? 3 : weeks.length > 5 ? 2 : 1;
  const focused = active == null ? null : weeks[active];

  return (
    <div>
      <div className="mb-2 flex gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-primary" />Fatti</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-muted-foreground/25 dark:bg-muted-foreground/40" />Previsti</span>
      </div>
      <div ref={ref} className="relative" style={{ height: HEIGHT }}>
        {width > 0 && (
          <svg width={width} height={HEIGHT} role="img" aria-label="Km di corsa per settimana" className="overflow-visible">
            {ticks.map((tick) => (
              <g key={tick}>
                <line x1={PAD.left} x2={PAD.left + innerW} y1={PAD.top + innerH - (tick / top) * innerH} y2={PAD.top + innerH - (tick / top) * innerH} stroke="var(--border)" strokeWidth={1} />
                <text x={PAD.left - 6} y={PAD.top + innerH - (tick / top) * innerH + 3.5} textAnchor="end" className="fill-muted-foreground text-[10px] tabular-nums">
                  {tick}
                </text>
              </g>
            ))}
            {weeks.map((week, index) => {
              const isCurrent = index === currentIndex;
              const isFuture = currentIndex >= 0 && index > currentIndex;
              return (
                <g
                  key={week.week_start}
                  tabIndex={0}
                  className="outline-none"
                  onPointerEnter={() => setActive(index)}
                  onPointerDown={() => setActive(index)}
                  onPointerLeave={() => setActive(null)}
                  onFocus={() => setActive(index)}
                  onBlur={() => setActive(null)}
                >
                  <rect x={PAD.left + slot * index} y={PAD.top} width={slot} height={innerH} fill="transparent" />
                  {week.planned_m > 0 && (
                    <path d={roundedTopBar(barX(index), y(week.planned_m), barW, PAD.top + innerH - y(week.planned_m))} className="fill-muted-foreground/20 dark:fill-muted-foreground/35" />
                  )}
                  {week.done_m > 0 && !isFuture && (
                    <path
                      d={roundedTopBar(barX(index), y(week.done_m), barW, PAD.top + innerH - y(week.done_m))}
                      className={active === index ? "fill-primary" : "fill-primary/85"}
                    />
                  )}
                  {isCurrent && (week.done_m > 0 || week.planned_m > 0) && (
                    <text x={barX(index) + barW / 2} y={Math.min(y(week.done_m), y(week.planned_m)) - 5} textAnchor="middle" className="fill-foreground text-[10px] font-semibold tabular-nums">
                      {kmLabel(week.done_m)}
                    </text>
                  )}
                  {(isCurrent || (index % labelEvery === 0 && Math.abs(index - currentIndex) > 1)) && (
                    <text x={barX(index) + barW / 2} y={HEIGHT - 6} textAnchor="middle" className={isCurrent ? "fill-foreground text-[10px] font-medium" : "fill-muted-foreground text-[10px]"}>
                      {isCurrent ? "Ora" : weekLabel(week.week_start)}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        )}
        {focused && active != null && (
          <div
            className="pointer-events-none absolute top-0 z-10 rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs shadow-sm"
            style={{ left: Math.min(Math.max(0, barX(active) + barW / 2 - 64), Math.max(0, width - 132)), width: 128 }}
          >
            <p className="text-[10px] text-muted-foreground">Settimana del {weekLabel(focused.week_start)}</p>
            <p className="font-semibold tabular-nums">{kmLabel(focused.done_m)} fatti</p>
            {focused.planned_m > 0 && <p className="text-muted-foreground tabular-nums">{kmLabel(focused.planned_m)} previsti</p>}
          </div>
        )}
      </div>
    </div>
  );
}

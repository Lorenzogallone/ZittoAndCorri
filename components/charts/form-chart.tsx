"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { intlLocale, type Locale } from "@/i18n/config";
import { niceTicks, useMeasuredWidth } from "./chart-utils";

export interface FormPoint {
  date: string;
  form: number;
  fatigue: number;
}

const HEIGHT = 150;
const PAD = { top: 10, right: 8, bottom: 22, left: 4 };
const SERIES = [
  { key: "form", color: "var(--viz-1)" },
  { key: "fatigue", color: "var(--viz-2)" },
] as const;

function dayLabel(iso: string, locale: Locale): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(intlLocale(locale), { day: "numeric", month: "short", timeZone: "UTC" });
}

/** Fitness (load built up over time) and fatigue (recent load), same scale. */
export function FormChart({ points }: { points: FormPoint[] }) {
  const t = useTranslations("activities.charts.form");
  const locale = useLocale() as Locale;
  const { ref, width } = useMeasuredWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  if (points.length < 2) return null;

  const innerW = Math.max(0, width - PAD.left - PAD.right);
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const max = Math.max(1, ...points.flatMap((p) => [p.form, p.fatigue])) * 1.1;
  const ticks = niceTicks(max, 2);
  const top = ticks[ticks.length - 1];
  const x = (index: number) => PAD.left + (index / (points.length - 1)) * innerW;
  const y = (value: number) => PAD.top + innerH - (value / top) * innerH;
  const path = (key: "form" | "fatigue") =>
    points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join(" ");
  // Month label on the first point of each new month.
  const months = points
    .map((p, i) => ({ i, date: p.date }))
    .filter(({ date }, i) => i > 0 && date.slice(0, 7) !== points[i - 1].date.slice(0, 7));
  const last = points[points.length - 1];

  const pick = (clientX: number, rect: DOMRect) => {
    const ratio = (clientX - rect.left - PAD.left) / Math.max(1, innerW);
    setActive(Math.min(points.length - 1, Math.max(0, Math.round(ratio * (points.length - 1)))));
  };
  const focused = active == null ? null : points[active];

  return (
    <div>
      <div className="mb-2 flex gap-4 text-xs text-muted-foreground">
        {SERIES.map((series) => (
          <span key={series.key} className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-3 rounded-full" style={{ background: series.color }} />
            {t(series.key)}
          </span>
        ))}
      </div>
      <div ref={ref} className="relative" style={{ height: HEIGHT }}>
        {width > 0 && (
          <svg
            width={width}
            height={HEIGHT}
            className="touch-pan-y overflow-visible outline-none"
            tabIndex={0}
            role="img"
            aria-label={t("aria", { form: Math.round(last.form), fatigue: Math.round(last.fatigue) })}
            onPointerMove={(event) => pick(event.clientX, event.currentTarget.getBoundingClientRect())}
            onPointerDown={(event) => pick(event.clientX, event.currentTarget.getBoundingClientRect())}
            onPointerLeave={() => setActive(null)}
            onBlur={() => setActive(null)}
            onKeyDown={(event) => {
              if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
              event.preventDefault();
              const delta = event.key === "ArrowLeft" ? -1 : 1;
              setActive((current) => Math.min(points.length - 1, Math.max(0, (current ?? points.length - 1) + delta)));
            }}
          >
            {ticks.map((tick) => (
              <line key={tick} x1={PAD.left} x2={PAD.left + innerW} y1={y(tick)} y2={y(tick)} stroke="var(--border)" strokeWidth={1} />
            ))}
            {months.map(({ i, date }) => (
              <text key={date} x={x(i)} y={HEIGHT - 6} textAnchor="middle" className="fill-muted-foreground text-micro">
                {new Date(`${date}T12:00:00Z`).toLocaleDateString(intlLocale(locale), { month: "short", timeZone: "UTC" })}
              </text>
            ))}
            {SERIES.map((series, index) => (
              <path
                // key on the width: Chromium does not recompute the dash pattern if only `d` changes.
                key={`${series.key}-${width}`}
                d={path(series.key)}
                pathLength={1}
                className="animate-draw"
                style={{ animationDelay: `${index * 120}ms` }}
                fill="none"
                stroke={series.color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}
            {SERIES.map((series) => (
              <circle key={`end-${series.key}`} cx={x(points.length - 1)} cy={y(last[series.key])} r={4} fill={series.color} stroke="var(--card)" strokeWidth={2} />
            ))}
            {active != null && (
              <g>
                <line x1={x(active)} x2={x(active)} y1={PAD.top} y2={PAD.top + innerH} stroke="var(--muted-foreground)" strokeWidth={1} opacity={0.5} />
                {SERIES.map((series) => (
                  <circle key={series.key} cx={x(active)} cy={y(points[active][series.key])} r={4} fill={series.color} stroke="var(--card)" strokeWidth={2} />
                ))}
              </g>
            )}
          </svg>
        )}
        {focused && active != null && (
          <div
            className="pointer-events-none absolute top-0 z-10 rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs shadow-sm"
            style={{ left: Math.min(Math.max(0, x(active) - 60), Math.max(0, width - 124)), width: 120 }}
          >
            <p className="text-micro text-muted-foreground">{dayLabel(focused.date, locale)}</p>
            {SERIES.map((series) => (
              <p key={series.key} className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <span className="h-0.5 w-2.5 rounded-full" style={{ background: series.color }} />
                  {t(series.key)}
                </span>
                <span className="font-semibold tabular-nums">{Math.round(focused[series.key])}</span>
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

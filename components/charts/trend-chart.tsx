"use client";

import { useState } from "react";
import { useMeasuredWidth } from "./chart-utils";
import { formatMetric, type BodyMetricKey, type DayValue } from "@/lib/metrics/body-trends";

const HEIGHT = 96;
const PAD = { top: 10, right: 10, bottom: 18, left: 4 };
const DAY_MS = 86_400_000;

function dayLabel(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("it-IT", { day: "numeric", month: "short", timeZone: "UTC" });
}

const time = (iso: string) => Date.parse(`${iso}T12:00:00Z`);

/**
 * Andamento di una metrica nel tempo: linea con i punti sull'asse delle date
 * reali (i giorni senza sync restano vuoti, non vengono inventati), scala
 * stretta sui valori e il periodo di 4 settimane fa evidenziato come confronto.
 */
export function TrendChart({
  metric,
  series,
  today,
  days = 90,
  label,
}: {
  metric: BodyMetricKey;
  series: DayValue[];
  today: string;
  days?: number;
  label: string;
}) {
  const { ref, width } = useMeasuredWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const end = time(today);
  const start = end - (days - 1) * DAY_MS;
  const points = series.filter((point) => time(point.date) >= start && time(point.date) <= end);
  if (points.length === 0) return null;

  const innerW = Math.max(0, width - PAD.left - PAD.right);
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const values = points.map((point) => point.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  const span = max - min || Math.abs(max) * 0.1 || 1;
  min -= span * 0.2;
  max += span * 0.2;
  const x = (iso: string) => PAD.left + ((time(iso) - start) / (end - start || 1)) * innerW;
  const y = (value: number) => PAD.top + innerH - ((value - min) / (max - min)) * innerH;
  const path = points.map((point, i) => `${i === 0 ? "M" : "L"}${x(point.date).toFixed(1)},${y(point.value).toFixed(1)}`).join(" ");
  const sparse = points.length < 25;
  const last = points[points.length - 1];
  // Finestre del confronto: ultime 2 settimane e le 2 settimane di 4 settimane prima.
  const band = (fromAge: number, toAge: number) => {
    const left = Math.max(PAD.left, x(new Date(end - toAge * DAY_MS).toISOString().slice(0, 10)));
    const right = x(new Date(end - fromAge * DAY_MS).toISOString().slice(0, 10));
    return { x: left, width: Math.max(0, right - left) };
  };
  const months = Array.from({ length: Math.ceil(days / 28) + 1 }, (_, i) => {
    const date = new Date(start);
    date.setUTCMonth(date.getUTCMonth() + i, 1);
    return date.toISOString().slice(0, 10);
  }).filter((iso) => time(iso) > start && time(iso) <= end);

  const pick = (clientX: number, rect: DOMRect) => {
    const px = clientX - rect.left;
    let best = 0;
    points.forEach((point, index) => {
      if (Math.abs(x(point.date) - px) < Math.abs(x(points[best].date) - px)) best = index;
    });
    setActive(best);
  };
  const focused = active == null ? null : points[active];

  return (
    <div ref={ref} className="relative" style={{ height: HEIGHT }}>
      {width > 0 && (
        <svg
          width={width}
          height={HEIGHT}
          className="touch-pan-y overflow-visible outline-none"
          tabIndex={0}
          role="img"
          aria-label={`${label}: ultimo valore ${formatMetric(metric, last.value)} il ${dayLabel(last.date)}`}
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
          {[band(28, 41), band(0, 13)].map((rect, index) => (
            <rect key={index} x={rect.x} y={PAD.top} width={rect.width} height={innerH} rx={4} className="fill-muted" opacity={index === 0 ? 0.6 : 1} />
          ))}
          {months.map((iso) => (
            <text key={iso} x={x(iso)} y={HEIGHT - 4} textAnchor="middle" className="fill-muted-foreground text-micro">
              {new Date(`${iso}T12:00:00Z`).toLocaleDateString("it-IT", { month: "short", timeZone: "UTC" })}
            </text>
          ))}
          {points.length > 1 && (
            <path
              key={`line-${width}`}
              d={path}
              pathLength={1}
              className="animate-draw"
              fill="none"
              stroke="var(--viz-1)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              opacity={sparse ? 0.5 : 1}
            />
          )}
          {sparse && points.map((point) => (
            <circle key={point.date} cx={x(point.date)} cy={y(point.value)} r={2.5} fill="var(--viz-1)" />
          ))}
          <circle cx={x(last.date)} cy={y(last.value)} r={4} fill="var(--viz-1)" stroke="var(--card)" strokeWidth={2} />
          {focused && (
            <g>
              <line x1={x(focused.date)} x2={x(focused.date)} y1={PAD.top} y2={PAD.top + innerH} stroke="var(--muted-foreground)" strokeWidth={1} opacity={0.5} />
              <circle cx={x(focused.date)} cy={y(focused.value)} r={4} fill="var(--viz-1)" stroke="var(--card)" strokeWidth={2} />
            </g>
          )}
        </svg>
      )}
      {focused && active != null && (
        <div
          className="pointer-events-none absolute -top-2 z-10 rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs shadow-sm"
          style={{ left: Math.min(Math.max(0, x(focused.date) - 48), Math.max(0, width - 100)), width: 96 }}
        >
          <p className="text-micro text-muted-foreground">{dayLabel(focused.date)}</p>
          <p className="font-semibold tabular-nums">{formatMetric(metric, focused.value)}</p>
        </div>
      )}
    </div>
  );
}

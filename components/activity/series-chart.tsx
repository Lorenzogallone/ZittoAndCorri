"use client";

import { useState } from "react";
import { useMeasuredWidth } from "@/components/charts/chart-utils";
import { formatDuration } from "@/lib/format";

const HEIGHT = 150;
const PAD = { top: 10, right: 6, bottom: 20, left: 34 };

/** Andamento nel tempo (cuore, quota): linea con area tenue e lettura al tocco. */
export function SeriesChart({
  points,
  color,
  unit,
  area = true,
}: {
  points: Array<{ t: number; v: number }>;
  color: string;
  unit: string;
  area?: boolean;
}) {
  const { ref, width } = useMeasuredWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  if (points.length < 2) return null;

  const innerW = Math.max(0, width - PAD.left - PAD.right);
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const values = points.map((p) => p.v);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const pad = Math.max(1, (rawMax - rawMin) * 0.1);
  const min = Math.floor(rawMin - pad);
  const max = Math.ceil(rawMax + pad);
  const t0 = points[0].t;
  const span = Math.max(1, points[points.length - 1].t - t0);
  const x = (t: number) => PAD.left + ((t - t0) / span) * innerW;
  const y = (v: number) => PAD.top + innerH - ((v - min) / (max - min || 1)) * innerH;
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const fill = `${line} L${x(points[points.length - 1].t).toFixed(1)},${PAD.top + innerH} L${PAD.left},${PAD.top + innerH} Z`;
  const ticks = [min, Math.round((min + max) / 2), max];

  const pick = (clientX: number, rect: DOMRect) => {
    const t = t0 + ((clientX - rect.left - PAD.left) / Math.max(1, innerW)) * span;
    let best = 0;
    for (let i = 1; i < points.length; i++) if (Math.abs(points[i].t - t) < Math.abs(points[best].t - t)) best = i;
    setActive(best);
  };
  const focused = active == null ? null : points[active];

  return (
    <div ref={ref} className="relative" style={{ height: HEIGHT }}>
      {width > 0 && (
        <svg
          width={width}
          height={HEIGHT}
          className="touch-pan-y overflow-visible"
          onPointerMove={(event) => pick(event.clientX, event.currentTarget.getBoundingClientRect())}
          onPointerDown={(event) => pick(event.clientX, event.currentTarget.getBoundingClientRect())}
          onPointerLeave={() => setActive(null)}
          role="img"
          aria-label={`Da ${rawMin} a ${rawMax} ${unit}`}
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={PAD.left} x2={PAD.left + innerW} y1={y(tick)} y2={y(tick)} stroke="var(--border)" strokeWidth={1} />
              <text x={PAD.left - 6} y={y(tick) + 3.5} textAnchor="end" className="fill-muted-foreground text-[10px] tabular-nums">{tick}</text>
            </g>
          ))}
          <text x={PAD.left} y={HEIGHT - 4} className="fill-muted-foreground text-[10px]">0:00</text>
          <text x={PAD.left + innerW} y={HEIGHT - 4} textAnchor="end" className="fill-muted-foreground text-[10px] tabular-nums">
            {formatDuration(span)}
          </text>
          {area && <path d={fill} fill={color} opacity={0.1} />}
          {/* key sulla larghezza: Chromium non ricalcola il tratteggio se cambia solo `d`. */}
          <path key={width} d={line} pathLength={1} className="animate-draw" fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {focused && (
            <g>
              <line x1={x(focused.t)} x2={x(focused.t)} y1={PAD.top} y2={PAD.top + innerH} stroke="var(--muted-foreground)" strokeWidth={1} opacity={0.5} />
              <circle cx={x(focused.t)} cy={y(focused.v)} r={4} fill={color} stroke="var(--card)" strokeWidth={2} />
            </g>
          )}
        </svg>
      )}
      {focused && (
        <div
          className="pointer-events-none absolute top-0 rounded-lg border border-border bg-popover px-2.5 py-1 text-xs shadow-sm"
          style={{ left: Math.min(Math.max(0, x(focused.t) - 45), Math.max(0, width - 92)) }}
        >
          <span className="font-semibold tabular-nums">{Math.round(focused.v)} {unit}</span>
          <span className="ml-1.5 text-muted-foreground tabular-nums">{formatDuration(focused.t - t0)}</span>
        </div>
      )}
    </div>
  );
}

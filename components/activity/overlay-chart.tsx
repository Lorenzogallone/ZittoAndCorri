"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useMeasuredWidth } from "@/components/charts/chart-utils";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/format";
import { useSegmentSelection } from "@/components/activity/segment-selection";
import { axisRange, smoothSeries } from "@/lib/chart-scale";

type Point = { t: number; v: number };
type Key = "hr" | "pace" | "elevation" | "cadence";

interface SeriesSpec {
  color: string;
  format: (value: number) => string;
  /** Inverted axis: for pace, higher = faster. */
  invert?: boolean;
  /** Drawn as a background area (elevation, like the route profile). */
  area?: boolean;
  /** Extreme values clipped: a skipped GPS point must not squash the line. */
  trim?: boolean;
  /** Smallest vertical range, in the series' unit. */
  minSpan?: number;
  /** Moving average over this many seconds, against sensor noise. */
  smoothS?: number;
}

const pace = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;

const SPECS: Record<Key, SeriesSpec> = {
  hr: { color: "var(--viz-2)", format: (v) => `${Math.round(v)} bpm` },
  pace: { color: "var(--viz-1)", format: (v) => `${pace(v)}/km`, invert: true, trim: true },
  // 80 m minimum: a flat run with 20 m of barometer drift must look nearly flat.
  elevation: { color: "var(--muted-foreground)", format: (v) => `${Math.round(v)} m`, area: true, minSpan: 80, smoothS: 20 },
  cadence: { color: "var(--chart-3)", format: (v) => `${Math.round(v)} spm`, trim: true },
};

/** Draw order: elevation underneath, lines on top. */
const ORDER: Key[] = ["elevation", "cadence", "pace", "hr"];

const HEIGHT = 180;
const PAD = { top: 12, right: 6, bottom: 20, left: 6 };

/** Point closest to t (sorted series), if not too far away. */
function nearest(points: Point[], t: number, tolerance: number): Point | null {
  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].t < t) lo = mid + 1;
    else hi = mid;
  }
  const candidates = [points[lo - 1], points[lo]].filter((p): p is Point => !!p);
  const best = candidates.sort((a, b) => Math.abs(a.t - t) - Math.abs(b.t - t))[0];
  return best && Math.abs(best.t - t) <= tolerance ? best : null;
}

/**
 * Run trend with several series overlaid on the same time (moving
 * time): each with its own scale, chosen with the chips. On touch a vertical
 * line and all the values at that instant.
 */
export function OverlayChart({
  series,
  initial = ["hr", "elevation"],
}: {
  series: Partial<Record<Key, Point[] | null>>;
  initial?: Key[];
}) {
  const t = useTranslations("activities.overlay");
  const { ref, width } = useMeasuredWidth<HTMLDivElement>();
  const available = ORDER.filter((key) => (series[key]?.length ?? 0) >= 2);
  const [shown, setShown] = useState<Key[]>(() => {
    const start = initial.filter((key) => available.includes(key));
    return start.length ? start : available.slice(-1);
  });
  const [cursor, setCursor] = useState<number | null>(null);
  const { segments, selected } = useSegmentSelection();
  if (!available.length) return null;

  const visible = ORDER.filter((key) => shown.includes(key) && available.includes(key));
  const all = available.flatMap((key) => series[key]!);
  const t0 = Math.min(...all.map((p) => p.t));
  const t1 = Math.max(...all.map((p) => p.t));
  const span = Math.max(1, t1 - t0);
  const innerW = Math.max(0, width - PAD.left - PAD.right);
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const x = (t: number) => PAD.left + ((t - t0) / span) * innerW;

  const drawn = visible.map((key) => {
    const spec = SPECS[key];
    const points = smoothSeries(series[key]!, spec.smoothS ?? 0);
    const { min, max } = axisRange(
      points.map((p) => p.v),
      { trim: spec.trim, minSpan: spec.minSpan, minPad: key === "elevation" ? 5 : 1 },
    );
    const y = (v: number) => {
      const clamped = Math.min(max, Math.max(min, v));
      const ratio = (clamped - min) / (max - min || 1);
      return PAD.top + innerH * (spec.invert ? ratio : 1 - ratio);
    };
    // Breaks (walking without pace, sensor gaps): new segment.
    const steps = points.slice(1).map((p, i) => p.t - points[i].t).sort((a, b) => a - b);
    const gap = Math.max(10, (steps[Math.floor(steps.length / 2)] ?? 1) * 4);
    const d = points
      .map((p, i) => `${i === 0 || p.t - points[i - 1].t > gap ? "M" : "L"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`)
      .join(" ");
    const fill = spec.area
      ? `${d} L${x(points[points.length - 1].t).toFixed(1)},${PAD.top + innerH} L${x(points[0].t).toFixed(1)},${PAD.top + innerH} Z`
      : null;
    return { key, spec, points, y, d, fill, gap };
  });

  const pick = (clientX: number, rect: DOMRect) =>
    setCursor(t0 + Math.min(1, Math.max(0, (clientX - rect.left - PAD.left) / Math.max(1, innerW))) * span);
  const readings = cursor == null
    ? []
    : drawn.map((line) => ({ ...line, point: nearest(line.points, cursor, line.gap) })).filter((r) => r.point);

  const toggle = (key: Key) =>
    setShown((current) => current.includes(key)
      ? current.length > 1 ? current.filter((k) => k !== key) : current
      : [...current, key]);

  return (
    <div>
      {available.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label={t("groupAria")}>
          {[...available].reverse().map((key) => {
            const on = shown.includes(key);
            return (
              <button
                key={key}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(key)}
                className={cn(
                  "pressable inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-medium",
                  on ? "border-transparent bg-muted text-foreground" : "border-border text-muted-foreground",
                )}
              >
                <span className={cn("h-2 w-2 rounded-full", !on && "opacity-40")} style={{ background: SPECS[key].color }} aria-hidden />
                {t(`series.${key}`)}
              </button>
            );
          })}
        </div>
      )}
      <div ref={ref} className="relative" style={{ height: HEIGHT }}>
        {width > 0 && (
          <svg
            width={width}
            height={HEIGHT}
            className="touch-pan-y overflow-visible"
            onPointerMove={(event) => pick(event.clientX, event.currentTarget.getBoundingClientRect())}
            onPointerDown={(event) => pick(event.clientX, event.currentTarget.getBoundingClientRect())}
            onPointerLeave={() => setCursor(null)}
            role="img"
            aria-label={t("chartAria", { series: visible.map((key) => t(`series.${key}`).toLowerCase()).join(", ") })}
          >
            <line x1={PAD.left} x2={PAD.left + innerW} y1={PAD.top + innerH} y2={PAD.top + innerH} stroke="var(--border)" strokeWidth={1} />
            {/* Intervals as faint bands; the segment chosen in the card more marked. */}
            {segments
              .filter((segment) => segment.kind === "work" || segment.index === selected)
              .map((segment) => {
                const left = x(Math.max(t0, segment.movingStart));
                const right = x(Math.min(t1, segment.movingEnd));
                const active = segment.index === selected;
                return right > left ? (
                  <rect
                    key={segment.index}
                    x={left}
                    y={PAD.top}
                    width={right - left}
                    height={innerH}
                    fill={active ? "var(--foreground)" : "var(--viz-1)"}
                    opacity={active ? 0.1 : 0.06}
                    rx={2}
                  />
                ) : null;
              })}
            <text x={PAD.left} y={HEIGHT - 4} className="fill-muted-foreground text-micro">0:00</text>
            <text x={PAD.left + innerW} y={HEIGHT - 4} textAnchor="end" className="fill-muted-foreground text-micro tabular-nums">{formatDuration(span)}</text>
            {drawn.map(({ key, spec, d, fill }) => (
              <g key={key}>
                {fill && <path d={fill} fill={spec.color} opacity={0.14} />}
                <path
                  d={d}
                  fill="none"
                  stroke={spec.color}
                  strokeWidth={spec.area ? 1.25 : 1.75}
                  strokeOpacity={spec.area ? 0.5 : 1}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </g>
            ))}
            {cursor != null && (
              <g>
                <line x1={x(cursor)} x2={x(cursor)} y1={PAD.top} y2={PAD.top + innerH} stroke="var(--muted-foreground)" strokeWidth={1} opacity={0.5} />
                {readings.map(({ key, spec, point, y }) => (
                  <circle key={key} cx={x(point!.t)} cy={y(point!.v)} r={3.5} fill={spec.color} stroke="var(--card)" strokeWidth={2} />
                ))}
              </g>
            )}
          </svg>
        )}
        {cursor != null && readings.length > 0 && (
          <div
            className="pointer-events-none absolute -top-1 rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs shadow-sm"
            style={x(cursor) > width / 2 ? { right: Math.max(0, width - x(cursor) + 8) } : { left: x(cursor) + 8 }}
          >
            <p className="text-micro text-muted-foreground tabular-nums">{formatDuration(cursor - t0)}</p>
            {[...readings].reverse().map(({ key, spec, point }) => (
              <p key={key} className="flex items-center gap-1.5 whitespace-nowrap font-medium tabular-nums">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: spec.color }} aria-hidden />
                {spec.format(point!.v)}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { roundedTopBar, useMeasuredWidth } from "@/components/charts/chart-utils";
import { formatPace } from "@/lib/format";
import type { Split } from "@/lib/types";

const HEIGHT = 150;
const PAD = { top: 18, right: 2, bottom: 20, left: 2 };

/** Un barra per km: più alta = più veloce. Il km più rapido è evidenziato. */
export function SplitsChart({ splits }: { splits: Split[] }) {
  const { ref, width } = useMeasuredWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  if (!splits.length) return null;

  const innerW = Math.max(0, width - PAD.left - PAD.right);
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const speeds = splits.map((split) => 1000 / Math.max(1, split.time_s));
  const maxSpeed = Math.max(...speeds);
  const floor = Math.min(...speeds) * 0.75;
  const fastest = speeds.indexOf(maxSpeed);
  const slot = innerW / splits.length;
  const barW = Math.min(24, Math.max(4, slot - 3));
  const barX = (index: number) => PAD.left + slot * index + (slot - barW) / 2;
  const barTop = (index: number) => PAD.top + innerH - ((speeds[index] - floor) / (maxSpeed - floor || 1)) * innerH;
  const labelEvery = splits.length > 20 ? 5 : splits.length > 10 ? 2 : 1;
  const focusIndex = active ?? fastest;
  const focused = splits[focusIndex];

  return (
    <div>
      <p className="mb-2 text-xs text-muted-foreground">
        {active == null ? "Km più veloce" : `Km ${focused.km}`}:{" "}
        <span className="font-semibold text-foreground tabular-nums">{formatPace(focused.time_s)}</span>
        {focused.avg_hr != null && <span className="tabular-nums"> · {focused.avg_hr} bpm</span>}
      </p>
      <div ref={ref} style={{ height: HEIGHT }}>
        {width > 0 && (
          <svg width={width} height={HEIGHT} role="img" aria-label="Passo per chilometro" onPointerLeave={() => setActive(null)}>
            {splits.map((split, index) => (
              <g key={split.km} onPointerEnter={() => setActive(index)} onPointerDown={() => setActive(index)}>
                <rect x={PAD.left + slot * index} y={PAD.top} width={slot} height={innerH} fill="transparent" />
                <path
                  d={roundedTopBar(barX(index), barTop(index), barW, PAD.top + innerH - barTop(index))}
                  className={`animate-grow-y ${index === focusIndex ? "fill-primary" : "fill-primary/45"}`}
                  style={{ animationDelay: `${Math.min(index * 30, 500)}ms` }}
                />
                {(index % labelEvery === 0 || index === splits.length - 1) && (
                  <text x={barX(index) + barW / 2} y={HEIGHT - 5} textAnchor="middle" className="fill-muted-foreground text-[10px] tabular-nums">
                    {split.km}
                  </text>
                )}
              </g>
            ))}
          </svg>
        )}
      </div>
    </div>
  );
}

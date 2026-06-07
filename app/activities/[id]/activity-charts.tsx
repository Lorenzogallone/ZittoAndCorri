"use client";

// Grafici del dettaglio corsa: HR nel tempo, passo/km, profilo altimetrico.
// Riceve dati già downsamplati dal Server Component (max ~300 punti per serie).

import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import {
  ChartContainer,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { useState, useEffect } from "react";
import { formatDuration, formatPace } from "@/lib/format";
import type { Split, HrPoint, GpsPoint } from "@/lib/types";

function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  return mounted;
}

// --- HR nel tempo -------------------------------------------------------

const hrConfig: ChartConfig = {
  bpm: { label: "HR", color: "var(--color-chart-1)" },
};

export function HrChart({ data }: { data: HrPoint[] }) {
  const mounted = useMounted();
  const chartData = data.map((p) => ({
    t: formatDuration(p.t),
    bpm: p.bpm,
  }));

  if (!mounted) {
    return <div className="h-40 w-full" />;
  }

  return (
    <ChartContainer config={hrConfig} className="h-40">
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} initialDimension={{ width: 100, height: 100 }}>
        <LineChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis
            dataKey="t"
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
            domain={["auto", "auto"]}
          />
          <Tooltip
            content={(props) => (
              <ChartTooltipContent {...props} formatter={(v) => `${v} bpm`} />
            )}
          />
          <Line
            type="monotone"
            dataKey="bpm"
            stroke="var(--color-chart-1)"
            strokeWidth={1.5}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}

// --- Passo per km -------------------------------------------------------

const paceConfig: ChartConfig = {
  pace: { label: "Passo", color: "var(--color-chart-2)" },
};

export function PaceChart({ splits }: { splits: Split[] }) {
  const mounted = useMounted();
  const chartData = splits.map((s) => ({
    km: `km ${s.km}`,
    pace: s.time_s,
  }));

  if (!mounted) {
    return <div className="h-40 w-full" />;
  }

  return (
    <ChartContainer config={paceConfig} className="h-40">
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} initialDimension={{ width: 100, height: 100 }}>
        <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis
            dataKey="km"
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => formatPace(v)}
            domain={["auto", "auto"]}
          />
          <Tooltip
            content={(props) => (
              <ChartTooltipContent {...props} formatter={(v) => formatPace(v)} />
            )}
          />
          <Bar
            dataKey="pace"
            fill="var(--color-chart-2)"
            radius={[3, 3, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}

// --- Profilo altimetrico -------------------------------------------------------

const eleConfig: ChartConfig = {
  ele: { label: "Quota", color: "var(--color-chart-3)" },
};

export function ElevationChart({ data }: { data: GpsPoint[] }) {
  const mounted = useMounted();
  const chartData = data.map((p) => ({
    t: formatDuration(p.t),
    ele: p.ele != null ? Math.round(p.ele) : null,
  }));

  if (!mounted) {
    return <div className="h-40 w-full" />;
  }

  return (
    <ChartContainer config={eleConfig} className="h-40">
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} initialDimension={{ width: 100, height: 100 }}>
        <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="eleGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-chart-3)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="var(--color-chart-3)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis
            dataKey="t"
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
            domain={["auto", "auto"]}
          />
          <Tooltip
            content={(props) => (
              <ChartTooltipContent {...props} formatter={(v) => `${v} m`} />
            )}
          />
          <Area
            type="monotone"
            dataKey="ele"
            stroke="var(--color-chart-3)"
            strokeWidth={1.5}
            fill="url(#eleGrad)"
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}
